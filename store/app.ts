import { defineStore } from 'pinia'
import { SECONDS_IN_A_DAY } from '@injectivelabs/utils'
import { DEFAULT_GAS_PRICE } from '@shared/utils/constant'
import { alchemyKey } from '@shared/wallet/wallet-strategy'
import { fetchGasPrice } from '@shared/services/ethGasPrice'
import { GeneralException } from '@injectivelabs/exceptions'
import { ChainId, EthereumChainId } from '@injectivelabs/ts-types'
import {
  NETWORK,
  CHAIN_ID,
  ETHEREUM_CHAIN_ID,
  GEO_IP_RESTRICTIONS_ENABLED,
  VPN_PROXY_VALIDATION_PERIOD
} from '@/app/utils/constants'
import {
  fetchGeoLocation,
  validateGeoLocation,
  fetchUserCountryFromBrowser,
  detectVPNOrProxyUsageNoThrow,
  displayVPNOrProxyUsageToast
} from '@/app/services/region'
import { Locale, english } from '@/locales'
import {
  isCountryRestrictedForSpotMarket,
  isCountryRestrictedForPerpetualMarkets
} from '@/app/data/geoip'
import { tendermintApi } from '@/app/Services'
import { todayInSeconds } from '@/app/utils/time'
import { streamProvider } from '@/app/providers/StreamProvider'
import {
  Modal,
  GeoLocation,
  NoticeBanner,
  TradingLayout,
  OrderbookLayout,
  UiMarketWithToken
} from '@/types'

export interface UserBasedState {
  favoriteMarkets: string[]
  bannersViewed: NoticeBanner[]
  modalsViewed: Modal[]

  geoLocation: GeoLocation
  preferences: {
    isHideBalances: boolean
    authZManagement: boolean
    thousandsSeparator: boolean
    tradingLayout: TradingLayout
    subaccountManagement: boolean
    orderbookLayout: OrderbookLayout
    skipTradeConfirmationModal: boolean
    skipExperimentalConfirmationModal: boolean
    showGridTradingSubaccounts: boolean
  }
}

type AppStoreState = {
  blockHeight: number

  // App Settings
  locale: Locale
  chainId: ChainId
  gasPrice: string
  ethereumChainId: EthereumChainId
  marketsOpen: boolean

  // Dev Mode
  devMode: boolean | undefined

  // User settings
  userState: UserBasedState
}

const initialStateFactory = (): AppStoreState => ({
  blockHeight: 0,

  // App Settings
  locale: english,
  chainId: CHAIN_ID,
  ethereumChainId: ETHEREUM_CHAIN_ID,
  gasPrice: DEFAULT_GAS_PRICE.toString(),
  marketsOpen: false,

  // Dev Mode
  devMode: undefined,

  // User settings
  userState: {
    modalsViewed: [],
    bannersViewed: [],
    favoriteMarkets: [],
    geoLocation: {
      continent: '',
      country: '',
      browserCountry: '',
      vpnCheckTimestamp: 0
    },
    preferences: {
      isHideBalances: false,
      authZManagement: false,
      thousandsSeparator: true,
      subaccountManagement: false,
      skipTradeConfirmationModal: false,
      tradingLayout: TradingLayout.Left,
      skipExperimentalConfirmationModal: false,
      orderbookLayout: OrderbookLayout.Default,
      showGridTradingSubaccounts: false
    }
  }
})

export const useAppStore = defineStore('app', {
  state: (): AppStoreState => initialStateFactory(),
  getters: {
    favoriteMarkets: (state: AppStoreState) => {
      return state.userState.favoriteMarkets
    },

    isSubaccountManagementActive: (state: AppStoreState) => {
      return state.userState?.preferences?.subaccountManagement
    },

    isAuthzManagementActive: (state: AppStoreState) => {
      return state.userState?.preferences?.authZManagement
    }
  },
  actions: {
    async init() {
      const appStore = useAppStore()

      await appStore.fetchGeoLocation()
    },

    async fetchBlockHeight() {
      const appStore = useAppStore()
      const latestBlock = await tendermintApi.fetchLatestBlock()

      appStore.$patch({
        blockHeight: Number(latestBlock?.header?.height || 0)
      })
    },

    async fetchGasPrice() {
      const appStore = useAppStore()

      appStore.$patch({
        gasPrice: await fetchGasPrice(NETWORK, { alchemyKey })
      })
    },

    async fetchGeoLocation() {
      const appStore = useAppStore()

      const geoLocation = await fetchGeoLocation()

      appStore.$patch({
        userState: {
          ...appStore.userState,
          geoLocation
        }
      })
    },

    async validateGeoIp() {
      const appStore = useAppStore()

      if (!GEO_IP_RESTRICTIONS_ENABLED) {
        return
      }
      const geoLocation = appStore.userState.geoLocation

      const now = todayInSeconds()
      const shouldCheckVpnOrProxyUsage = SECONDS_IN_A_DAY.times(
        VPN_PROXY_VALIDATION_PERIOD
      )
        .plus(geoLocation.vpnCheckTimestamp)
        .lte(now)

      if (!shouldCheckVpnOrProxyUsage) {
        return
      }

      const vpnOrProxyUsageDetected = await detectVPNOrProxyUsageNoThrow()

      if (!vpnOrProxyUsageDetected) {
        appStore.setUserState({
          ...appStore.userState,
          geoLocation: {
            ...geoLocation,
            vpnCheckTimestamp: todayInSeconds()
          }
        })

        return
      }

      /*
       ** If vpn is detected, we get the geolocation from
       ** browser api to check if it's on the restricted list
       ** Else we use geoip to check if the user is
       ** in a country from the restricted list
       */

      await displayVPNOrProxyUsageToast()

      const userCountryFromBrowser = await fetchUserCountryFromBrowser()

      appStore.setUserState({
        ...appStore.userState,
        geoLocation: {
          ...geoLocation,
          browserCountry: userCountryFromBrowser
        }
      })

      const countryToPerformValidation =
        userCountryFromBrowser || appStore.userState.geoLocation.country

      validateGeoLocation(countryToPerformValidation)

      appStore.setUserState({
        ...appStore.userState,
        geoLocation: {
          ...geoLocation,
          vpnCheckTimestamp: todayInSeconds()
        }
      })
    },

    validateGeoIpBasedOnDerivativesAction() {
      const appStore = useAppStore()

      if (
        isCountryRestrictedForPerpetualMarkets(
          appStore.userState.geoLocation.browserCountry ||
            appStore.userState.geoLocation.country
        )
      ) {
        throw new GeneralException(
          new Error('This action is not allowed in your country')
        )
      }
    },

    validateGeoIpBasedOnSpotAction(market: UiMarketWithToken) {
      const appStore = useAppStore()

      const isCountryRestrictedFromSpotMarket = [
        market.baseToken,
        market.quoteToken
      ].some((token) =>
        isCountryRestrictedForSpotMarket({
          country:
            appStore.userState.geoLocation.browserCountry ||
            appStore.userState.geoLocation.country,
          denomOrSymbol: token.symbol.toLowerCase()
        })
      )

      if (isCountryRestrictedFromSpotMarket) {
        throw new GeneralException(
          new Error('This action is not allowed in your country')
        )
      }
    },

    toggleFavoriteMarket(marketId: string) {
      const appStore = useAppStore()

      const cachedFavoriteMarkets = appStore.userState.favoriteMarkets

      const favoriteMarkets = cachedFavoriteMarkets.includes(marketId)
        ? cachedFavoriteMarkets.filter((m) => m !== marketId)
        : [marketId, ...cachedFavoriteMarkets]

      appStore.$patch({
        userState: {
          ...appStore.userState,
          favoriteMarkets
        }
      })
    },

    toggleHideBalances() {
      const appStore = useAppStore()

      appStore.setUserState({
        ...appStore.userState,
        preferences: {
          ...appStore.userState.preferences,
          isHideBalances: !appStore.userState.preferences.isHideBalances
        }
      })
    },

    setUserState(userState: Object) {
      const appStore = useAppStore()

      // we have to use patch for values that we are caching in localStorage, this ensure that the payload is passed to the persistState function

      appStore.$patch({ userState })
    },

    async pollMarkets() {
      const derivativeStore = useDerivativeStore()
      const spotStore = useSpotStore()

      await derivativeStore.fetchMarketsSummary()
      await spotStore.fetchMarketsSummary()
    },

    cancelAllStreams() {
      streamProvider.cancelAll()
    },

    reset() {
      const appStore = useAppStore()

      const initialState = initialStateFactory()

      appStore.$patch({
        ...initialState
      })
      appStore.userState = initialState.userState
    }
  }
})
