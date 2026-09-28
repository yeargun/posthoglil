// Upstream extension classes, bundled on their own like dist/extension-bundles.js.
import { PostHogFeatureFlags } from '@upstream/posthog-featureflags'
import { Autocapture } from '@upstream/autocapture'
import { HistoryAutocapture } from '@upstream/extensions/history-autocapture'
import { Heatmaps } from '@upstream/heatmaps'
import { DeadClicksAutocapture } from '@upstream/extensions/dead-clicks-autocapture'
import { ExceptionObserver } from '@upstream/extensions/exception-autocapture'
import { PostHogExceptions } from '@upstream/posthog-exceptions'
import { PostHogLogs } from '@upstream/posthog-logs'
import { PostHogMetrics } from '@upstream/posthog-metrics'
import { WebExperiments } from '@upstream/web-experiments'
import { SiteApps } from '@upstream/site-apps'
import { TracingHeaders } from '@upstream/extensions/tracing-headers'
import { Toolbar } from '@upstream/extensions/toolbar'

export const FeatureFlagsExtensions = { featureFlags: PostHogFeatureFlags }
export const AnalyticsExtensions = { autocapture: Autocapture, historyAutocapture: HistoryAutocapture, heatmaps: Heatmaps, deadClicksAutocapture: DeadClicksAutocapture }
export const ErrorTrackingExtensions = { exceptionObserver: ExceptionObserver, exceptions: PostHogExceptions }
export const LogsExtensions = { logs: PostHogLogs }
export const MetricsExtensions = { metrics: PostHogMetrics }
export const ExperimentsExtensions = { experiments: WebExperiments }
export const SiteAppsExtensions = { siteApps: SiteApps }
export const TracingExtensions = { tracingHeaders: TracingHeaders }
export const ToolbarExtensions = { toolbar: Toolbar }
