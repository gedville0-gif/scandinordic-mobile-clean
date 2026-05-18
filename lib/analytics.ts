import { usePostHog } from 'posthog-react-native';

export type AnalyticsEvent =
  | 'receipt_uploaded'
  | 'receipt_scanned'
  | 'transaction_imported'
  | 'invoice_created'
  | 'export_data_requested'
  | 'account_deleted';

type EventProperties = Record<string, string | number | boolean | null>;

export function useAnalytics() {
  const posthog = usePostHog();
  return {
    track: (event: AnalyticsEvent, properties?: EventProperties) => {
      posthog?.capture(event, properties);
    },
  };
}
