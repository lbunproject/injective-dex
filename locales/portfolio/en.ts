import { PortfolioChartType, I18nMessageFunction } from '@/types'

export default {
  portfolio: {
    assetsFrom: 'Assets From',
    totalValue: 'Total Value',
    value: 'Portfolio Value',

    home: {
      [PortfolioChartType.Balance]: {
        title: 'Portfolio Value'
      },
      [PortfolioChartType.Pnl]: {
        title: 'Trading PnL',
        tooltip:
          'The profit and loss calculations on the portfolio page reflect the approximate realized profit and loss from positions opened and closed on Helix since May 29, 2024. This calculation  is purely for illustrative purposes and should not be used for any tax reporting obligations.'
      },
      [PortfolioChartType.Volume]: {
        title: 'Trade Volume (Weekly)'
      }
    },

    balances: {
      netWorth: 'Net Worth',
      available: 'Available',
      inUseReserved: 'In Use/Reserved',
      unrealizedPnl: 'Unrealized PnL',
      total: 'Total',
      totalValueUsd: 'Total Value (USD)',
      transferToMain: 'Transfer to Main'
    },

    subaccounts: {
      name: 'Subaccount Name',
      address: 'Subaccount Address',
      totalValue: 'Total Value (USD)',
      description:
        'This is a secondary account linked to your main account for separate management and trading of digital assets. To activate it, you first need to transfer funds. Learn more about subaccounts in our FAQ.',
      addSubaccount: 'Add Subaccount',
      addSubaccountOrTransfer: 'Add Subaccount / Transfer'
    },

    history: {
      wallet: {
        noHistory: 'No transfers found'
      }
    },

    settings: {
      title: 'Settings',

      authz: {
        title: 'Access Control Manager',
        description:
          'Grant other wallet address full/partial permissions to make trades on their behalf',
        grantee: 'Grantee',
        granteeAddress: 'Grantee Address',
        grantedFunctions: 'Granted Functions',
        actions: 'Actions',
        granter: 'Granter',
        addNewGrantee: 'Add new grantee address',
        addGranteeAddress: 'Add grantee address',
        noGrants: 'No grants found',
        viewGrantedFunctions: 'View granted functions',
        connected: 'Connected',
        connectAs: 'Connect as',
        revoke: 'Revoke',
        revokeAll: 'Revoke All'
      },

      preferences: {
        title: 'Preferences',
        description: 'Customize your trading experience',
        thousandsSeparator: 'Thousands Separator',
        showGridTradingSubaccounts: 'Show Grid Trading Subaccounts'
      },

      autoSign: {
        title: 'Auto-Sign',
        titleWithoutHyphen: 'Auto Sign',
        description: 'Automatically sign transactions',
        howItWorks:
          'During the enabled duration (1 hour), you can perform many operations on Helix (including opening/closing positions on spot and perp trading pairs, setting limit orders, and creating TP/SL parameters) without signing additional transactions. Interactions with the swap feature or trading bots are not included. For security reasons, the auto sign function will expire after the 1 hour time frame, at which point you may choose to initiate a new session.',
        enable: 'Enable Auto-Sign',
        enabledToast: {
          title: 'Auto sign is enabled',
          description: 'Auto sign is active for 1 hour.'
        },
        disabledToast: {
          title: 'Auto sign is disabled'
        },
        expiredToast: {
          title: 'Auto sign session has expired',
          settings: 'Settings',
          description: ({ interpolate, named }: I18nMessageFunction) =>
            interpolate([
              'You can start a new session from ',
              named('settings')
            ])
        },
        disconnect: 'Disconnect Auto-Sign'
      }
    },

    filters: {
      cleanFilters: 'Clean Filters',
      filterBySide: 'Filter by Side'
    }
  }
}
