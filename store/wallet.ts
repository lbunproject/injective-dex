import { defineStore } from 'pinia'
import {
  MsgGrant,
  PrivateKey,
  getEthereumAddress,
  getInjectiveAddress,
  getDefaultSubaccountId,
  getGenericAuthorizationFromMessageType
} from '@injectivelabs/sdk-ts'
import { msgBroadcaster } from '@shared/WalletService'
import { GeneralException } from '@injectivelabs/exceptions'
import { CosmosChainId, MsgType } from '@injectivelabs/ts-types'
import { isCosmosWallet, isEthWallet, Wallet } from '@injectivelabs/wallet-ts'
import { walletStrategy } from '@shared/wallet/wallet-strategy'
import {
  validateCosmosWallet,
  confirmCorrectKeplrAddress
} from '@/app/services/cosmos'
import {
  validateTrustWallet,
  isTrustWalletInstalled
} from '@/app/services/trust-wallet'
import { GrantDirection } from '@/types/authZ'
import { mixpanelAnalytics } from '@/app/providers/mixpanel'
import { isOkxWalletInstalled } from '@/app/services/okx'
import { isBitGetInstalled } from '@/app/services/bitget'
import { isPhantomInstalled } from '@/app/services/phantom'
import { confirm, connect, getAddresses } from '@/app/services/wallet'
import { validateMetamask, isMetamaskInstalled } from '@/app/services/metamask'
import { BusEvents, WalletConnectStatus } from '@/types'

type WalletStoreState = {
  wallet: Wallet

  address: string
  addresses: string[]
  injectiveAddress: string
  defaultSubaccountId: string
  addressConfirmation: string

  trustWalletInstalled: boolean
  metamaskInstalled: boolean
  phantomInstalled: boolean
  okxWalletInstalled: boolean
  bitGetInstalled: boolean

  walletConnectStatus: WalletConnectStatus

  authZ: {
    address: string
    direction: GrantDirection
    injectiveAddress: string
    defaultSubaccountId: string
  }

  autoSign?: {
    privateKey: string
    injectiveAddress: string
    expiration: number
  }
}

const initialStateFactory = (): WalletStoreState => ({
  address: '',
  addresses: [],
  injectiveAddress: '',
  defaultSubaccountId: '',
  addressConfirmation: '',
  wallet: Wallet.Metamask,

  metamaskInstalled: false,
  trustWalletInstalled: false,
  okxWalletInstalled: false,
  phantomInstalled: false,
  bitGetInstalled: false,

  walletConnectStatus: WalletConnectStatus.idle,

  authZ: {
    address: '',
    direction: GrantDirection.Grantee,
    injectiveAddress: '',
    defaultSubaccountId: ''
  },

  autoSign: undefined
})

export const useWalletStore = defineStore('wallet', {
  state: (): WalletStoreState => initialStateFactory(),
  getters: {
    isUserWalletConnected: (state) => {
      const addressConnectedAndConfirmed =
        !!state.address && !!state.addressConfirmation
      const hasAddresses = state.addresses.length > 0

      return (
        hasAddresses && addressConnectedAndConfirmed && !!state.injectiveAddress
      )
    },

    isAuthzWalletConnected: (state) => {
      const addressConnectedAndConfirmed =
        !!state.address && !!state.addressConfirmation
      const hasAddresses = state.addresses.length > 0
      const isUserWalletConnected =
        hasAddresses && addressConnectedAndConfirmed && !!state.injectiveAddress

      return (
        isUserWalletConnected &&
        !!state.authZ.address &&
        !!state.authZ.injectiveAddress
      )
    },

    isCosmosWallet: (state) => {
      return isCosmosWallet(state.wallet)
    },

    authZOrInjectiveAddress: (state) => {
      return state.authZ.injectiveAddress || state.injectiveAddress
    },

    authZOrDefaultSubaccountId: (state) => {
      return state.authZ.defaultSubaccountId || state.defaultSubaccountId
    },

    authZOrAddress: (state) => {
      return state.authZ.address || state.address
    }
  },
  actions: {
    async init() {
      const walletStore = useWalletStore()

      if (!walletStore.wallet) {
        return
      }

      await connect({
        wallet: walletStore.autoSign?.privateKey
          ? Wallet.PrivateKey
          : walletStore.wallet,
        options: { privateKey: walletStore.autoSign?.privateKey }
      })
    },

    async connectWallet(wallet: Wallet) {
      const walletStore = useWalletStore()

      walletStore.$patch({
        wallet,
        walletConnectStatus: WalletConnectStatus.connecting
      })

      await connect({ wallet })
    },

    connectAuthZ(
      injectiveAddress: string,
      direction: GrantDirection = GrantDirection.Granter
    ) {
      const walletStore = useWalletStore()
      const accountStore = useAccountStore()

      walletStore.$patch({
        authZ: {
          direction,
          injectiveAddress,
          address: getEthereumAddress(injectiveAddress),
          defaultSubaccountId: getDefaultSubaccountId(injectiveAddress)
        }
      })

      accountStore.$patch({
        subaccountId: getDefaultSubaccountId(injectiveAddress)
      })

      useEventBus(BusEvents.WalletConnected).emit()
      useEventBus(BusEvents.SubaccountChange).emit()
    },

    onConnect() {
      const walletStore = useWalletStore()
      const accountStore = useAccountStore()

      accountStore.$patch({
        subaccountId: walletStore.defaultSubaccountId
      })

      walletStore.$patch({
        walletConnectStatus: WalletConnectStatus.connected
      })

      useEventBus(BusEvents.WalletConnected).emit()
      useEventBus(BusEvents.SubaccountChange).emit()
    },

    async isMetamaskInstalled() {
      const walletStore = useWalletStore()

      walletStore.$patch({
        metamaskInstalled: await isMetamaskInstalled()
      })
    },

    async isTrustWalletInstalled() {
      const walletStore = useWalletStore()

      walletStore.$patch({
        trustWalletInstalled: await isTrustWalletInstalled()
      })
    },

    async isOkxWalletInstalled() {
      const walletStore = useWalletStore()

      walletStore.$patch({
        okxWalletInstalled: await isOkxWalletInstalled()
      })
    },

    async isPhantomInstalled() {
      const walletStore = useWalletStore()

      walletStore.$patch({
        phantomInstalled: await isPhantomInstalled()
      })
    },

    async isBitGetInstalled() {
      const walletStore = useWalletStore()

      walletStore.$patch({
        bitGetInstalled: await isBitGetInstalled()
      })
    },

    async getHWAddresses(wallet: Wallet) {
      const walletStore = useWalletStore()

      if (walletStore.addresses.length === 0 || walletStore.wallet !== wallet) {
        await connect({ wallet })

        const addresses = await getAddresses()
        const injectiveAddresses = addresses.map(getInjectiveAddress)

        walletStore.$patch({
          wallet,
          addresses: injectiveAddresses
        })
      } else {
        const addresses = await getAddresses()
        const injectiveAddresses = addresses.map(getInjectiveAddress)

        walletStore.$patch({
          wallet,
          addresses: [...walletStore.addresses, ...injectiveAddresses]
        })
      }
    },

    async connectLedger(address: string) {
      const walletStore = useWalletStore()

      await walletStore.connectWallet(walletStore.wallet)

      const addresses = [address]
      const addressConfirmation = await confirm(address)
      const injectiveAddress = getInjectiveAddress(address)

      walletStore.$patch({
        address,
        addresses,
        injectiveAddress,
        addressConfirmation,
        defaultSubaccountId: getDefaultSubaccountId(injectiveAddress)
      })

      await walletStore.onConnect()
    },

    async connectLedgerLegacy(address: string) {
      const walletStore = useWalletStore()

      await walletStore.connectWallet(walletStore.wallet)

      const addresses = [address]
      const addressConfirmation = await confirm(address)
      const injectiveAddress = getInjectiveAddress(address)

      walletStore.$patch({
        address,
        addresses,
        injectiveAddress,
        addressConfirmation,
        defaultSubaccountId: getDefaultSubaccountId(injectiveAddress)
      })

      await walletStore.onConnect()
    },

    async connectTrezor(address: string) {
      const walletStore = useWalletStore()

      await walletStore.connectWallet(walletStore.wallet)

      const addresses = [address]
      const addressConfirmation = await confirm(address)
      const injectiveAddress = getInjectiveAddress(address)

      walletStore.$patch({
        address,
        addresses,
        injectiveAddress,
        addressConfirmation,
        defaultSubaccountId: getDefaultSubaccountId(injectiveAddress)
      })

      await walletStore.onConnect()
    },

    async connectMetamask() {
      const walletStore = useWalletStore()

      await walletStore.connectWallet(Wallet.Metamask)

      const addresses = await getAddresses()
      const [address] = addresses
      const addressConfirmation = await confirm(address)
      const injectiveAddress = getInjectiveAddress(address)

      walletStore.$patch({
        address,
        addresses,
        injectiveAddress,
        addressConfirmation,
        defaultSubaccountId: getDefaultSubaccountId(injectiveAddress)
      })

      await walletStore.onConnect()
    },

    async connectTrustWallet() {
      const walletStore = useWalletStore()

      await walletStore.connectWallet(Wallet.TrustWallet)

      const addresses = await getAddresses()
      const [address] = addresses
      const addressConfirmation = await confirm(address)
      const injectiveAddress = getInjectiveAddress(address)

      walletStore.$patch({
        address,
        addresses,
        injectiveAddress,
        addressConfirmation,
        defaultSubaccountId: getDefaultSubaccountId(injectiveAddress)
      })

      await walletStore.onConnect()
    },

    async connectOkxWallet() {
      const walletStore = useWalletStore()

      await walletStore.connectWallet(Wallet.OkxWallet)

      const addresses = await getAddresses()
      const [address] = addresses
      const addressConfirmation = await confirm(address)
      const injectiveAddress = getInjectiveAddress(address)

      walletStore.$patch({
        address,
        addresses,
        injectiveAddress,
        addressConfirmation,
        defaultSubaccountId: getDefaultSubaccountId(injectiveAddress)
      })

      await walletStore.onConnect()
    },

    async connectBitGet() {
      const walletStore = useWalletStore()

      await walletStore.connectWallet(Wallet.BitGet)

      const addresses = await getAddresses()
      const [address] = addresses
      const addressConfirmation = await confirm(address)
      const injectiveAddress = getInjectiveAddress(address)

      walletStore.$patch({
        address,
        addresses,
        injectiveAddress,
        addressConfirmation,
        defaultSubaccountId: getDefaultSubaccountId(injectiveAddress)
      })

      await walletStore.onConnect()
    },

    async connectPhantom() {
      const walletStore = useWalletStore()

      await walletStore.connectWallet(Wallet.Phantom)

      const addresses = await getAddresses()
      const [address] = addresses
      const addressConfirmation = await confirm(address)
      const injectiveAddress = getInjectiveAddress(address)

      walletStore.$patch({
        address,
        addresses,
        injectiveAddress,
        addressConfirmation,
        defaultSubaccountId: getDefaultSubaccountId(injectiveAddress)
      })

      await walletStore.onConnect()
    },

    async connectWalletConnect() {
      const walletStore = useWalletStore()

      await walletStore.connectWallet(Wallet.WalletConnect)

      const addresses = await getAddresses()
      const [address] = addresses
      const addressConfirmation = await confirm(address)
      const injectiveAddress = getInjectiveAddress(address)

      walletStore.$patch({
        address,
        addresses,
        injectiveAddress,
        addressConfirmation,
        defaultSubaccountId: getDefaultSubaccountId(injectiveAddress)
      })

      await walletStore.onConnect()
    },

    async connectKeplr() {
      const walletStore = useWalletStore()

      await walletStore.connectWallet(Wallet.Keplr)

      const injectiveAddresses = await getAddresses()
      const [injectiveAddress] = injectiveAddresses
      const addressConfirmation = await confirm(injectiveAddress)
      const ethereumAddress = getEthereumAddress(injectiveAddress)

      await confirmCorrectKeplrAddress(injectiveAddress)

      walletStore.$patch({
        injectiveAddress,
        addressConfirmation,
        address: ethereumAddress,
        addresses: injectiveAddresses,
        defaultSubaccountId: getDefaultSubaccountId(injectiveAddress)
      })

      await walletStore.onConnect()
    },

    async connectLeap() {
      const walletStore = useWalletStore()

      await walletStore.connectWallet(Wallet.Leap)

      const injectiveAddresses = await getAddresses()
      const [injectiveAddress] = injectiveAddresses
      const addressConfirmation = await confirm(injectiveAddress)
      const ethereumAddress = getEthereumAddress(injectiveAddress)

      walletStore.$patch({
        injectiveAddress,
        addressConfirmation,
        address: ethereumAddress,
        addresses: injectiveAddresses,
        defaultSubaccountId: getDefaultSubaccountId(injectiveAddress)
      })

      await walletStore.onConnect()
    },

    async connectNinji() {
      const walletStore = useWalletStore()

      await walletStore.connectWallet(Wallet.Ninji)

      const injectiveAddresses = await getAddresses()
      const [injectiveAddress] = injectiveAddresses
      const addressConfirmation = await confirm(injectiveAddress)
      const ethereumAddress = getEthereumAddress(injectiveAddress)

      walletStore.$patch({
        injectiveAddress,
        addressConfirmation,
        address: ethereumAddress,
        addresses: injectiveAddresses,
        defaultSubaccountId: getDefaultSubaccountId(injectiveAddress)
      })

      await walletStore.onConnect()
    },

    async connectCosmostation() {
      const walletStore = useWalletStore()

      await walletStore.connectWallet(Wallet.Cosmostation)

      const injectiveAddresses = await getAddresses()
      const [injectiveAddress] = injectiveAddresses
      const addressConfirmation = await confirm(injectiveAddress)
      const ethereumAddress = getEthereumAddress(injectiveAddress)

      walletStore.$patch({
        injectiveAddress,
        addressConfirmation,
        address: ethereumAddress,
        addresses: injectiveAddresses,
        defaultSubaccountId: getDefaultSubaccountId(injectiveAddress)
      })

      await walletStore.onConnect()
    },

    async connectTorus() {
      const walletStore = useWalletStore()

      await walletStore.connectWallet(Wallet.Torus)

      const addresses = await getAddresses()
      const [address] = addresses
      const addressConfirmation = await confirm(address)
      const injectiveAddress = getInjectiveAddress(address)

      walletStore.$patch({
        address,
        addresses,
        injectiveAddress,
        addressConfirmation,
        defaultSubaccountId: getDefaultSubaccountId(injectiveAddress)
      })

      await walletStore.onConnect()
    },

    async connectAddress(injectiveAddress: string) {
      const walletStore = useWalletStore()

      await walletStore.connectWallet(Wallet.Metamask)

      const addressConfirmation = await confirm(injectiveAddress)
      const address = getEthereumAddress(injectiveAddress)

      walletStore.$patch({
        address,
        addresses: [address],
        injectiveAddress,
        addressConfirmation,
        defaultSubaccountId: getDefaultSubaccountId(injectiveAddress)
      })

      await walletStore.onConnect()
    },

    setWalletConnectStatus(walletConnectStatus: WalletConnectStatus) {
      const walletStore = useWalletStore()

      walletStore.$patch({
        walletConnectStatus
      })
    },

    setAddresses(addresses: string[]) {
      const walletStore = useWalletStore()

      walletStore.$patch({
        addresses
      })
    },

    async validate() {
      const appStore = useAppStore()
      const walletStore = useWalletStore()

      const isAutoSignEnabled = !!walletStore.autoSign

      if (walletStore.wallet === Wallet.Metamask && !isAutoSignEnabled) {
        await validateMetamask(walletStore.address, appStore.ethereumChainId)
      }

      if (walletStore.wallet === Wallet.TrustWallet && !isAutoSignEnabled) {
        await validateTrustWallet(walletStore.address, appStore.ethereumChainId)
      }

      if (
        isEthWallet(walletStore.wallet) &&
        walletStore.isAuthzWalletConnected &&
        !isAutoSignEnabled
      ) {
        throw new GeneralException(
          new Error(
            'Ethereum native wallets currently do not support AuthZ transactions'
          )
        )
      }

      if (isCosmosWallet(walletStore.wallet) && !isAutoSignEnabled) {
        await validateCosmosWallet({
          address: walletStore.injectiveAddress,
          chainId: appStore.chainId as unknown as CosmosChainId,
          wallet: walletStore.wallet
        })
      }
    },

    async disconnect() {
      const spotStore = useSpotStore()
      const authZStore = useAuthZStore()
      const walletStore = useWalletStore()
      const accountStore = useAccountStore()
      const exchangeStore = useExchangeStore()
      const activityStore = useActivityStore()
      const positionStore = usePositionStore()
      const campaignStore = useCampaignStore()
      const derivativeStore = useDerivativeStore()
      const gridStrategyStore = useGridStrategyStore()

      await walletStrategy.disconnect()

      mixpanelAnalytics.trackLogout()

      walletStore.reset()
      spotStore.resetSubaccount()
      derivativeStore.resetSubaccount()

      exchangeStore.$patch({ feeDiscountAccountInfo: undefined })
      accountStore.$reset()
      activityStore.$reset()
      positionStore.$reset()
      authZStore.$reset()
      campaignStore.reset()
      gridStrategyStore.$patch({ strategies: [] })
    },

    async disconnectAutoSign() {
      const walletStore = useWalletStore()

      await walletStore.resetAutoSign()
      await connect({ wallet: walletStore.wallet })
    },

    reset() {
      const walletStore = useWalletStore()

      const {
        address,
        addresses,
        injectiveAddress,
        defaultSubaccountId,
        addressConfirmation,
        authZ
      } = initialStateFactory()

      walletStore.resetAutoSign()

      walletStore.$patch({
        authZ,
        address,
        addresses,
        injectiveAddress,
        defaultSubaccountId,
        addressConfirmation
      })
    },

    resetAuthZ() {
      const walletStore = useWalletStore()
      const accountStore = useAccountStore()

      walletStore.$patch({
        authZ: {
          address: '',
          injectiveAddress: '',
          defaultSubaccountId: '',
          direction: GrantDirection.Grantee
        }
      })

      accountStore.$patch({
        subaccountId: walletStore.defaultSubaccountId
      })

      useEventBus(BusEvents.WalletConnected).emit()
      useEventBus(BusEvents.SubaccountChange).emit()
    },

    resetAutoSign() {
      const walletStore = useWalletStore()

      walletStore.$patch({
        autoSign: undefined
      })

      walletStrategy.setWallet(walletStore.wallet)
    },

    async connectAutoSign() {
      const walletStore = useWalletStore()

      const { privateKey } = PrivateKey.generate()
      const injectiveAddress = privateKey.toBech32()

      const tradingMessages = [
        MsgType.MsgCancelSpotOrder,
        MsgType.MsgBatchUpdateOrders,
        MsgType.MsgCreateSpotLimitOrder,
        MsgType.MsgCancelDerivativeOrder,
        MsgType.MsgCreateSpotMarketOrder,
        MsgType.MsgBatchCancelSpotOrders,
        MsgType.MsgBatchCreateSpotLimitOrders,
        MsgType.MsgCreateDerivativeLimitOrder,
        MsgType.MsgCreateDerivativeMarketOrder,
        MsgType.MsgBatchCancelDerivativeOrders,
        MsgType.MsgBatchCreateDerivativeLimitOrders
      ]

      const authZMsgs = tradingMessages.map((messageType) =>
        MsgGrant.fromJSON({
          grantee: injectiveAddress,
          granter: walletStore.injectiveAddress,
          expiryInSeconds: Date.now() * 1000 + 60 * 60,
          authorization: getGenericAuthorizationFromMessageType(messageType)
        })
      )

      await msgBroadcaster.broadcastWithFeeDelegation({
        msgs: authZMsgs,
        injectiveAddress: walletStore.injectiveAddress
      })

      const autoSign = {
        injectiveAddress,
        privateKey: privateKey.toPrivateKeyHex(),
        expiration: Date.now() + 1000 * 60 * 60
      }

      walletStore.$patch({
        autoSign
      })

      await connect({
        wallet: Wallet.PrivateKey,
        options: { privateKey: autoSign.privateKey }
      })
    }
  }
})
