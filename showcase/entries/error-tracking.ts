// The exception-capture pipeline as posthog-js builds it (posthog-exceptions.ts).
export { ErrorPropertiesBuilder } from '../../vendor/posthog-js/packages/core/src/error-tracking/error-properties-builder'
export { DOMExceptionCoercer, ErrorCoercer, ErrorEventCoercer, EventCoercer, ObjectCoercer, PrimitiveCoercer, PromiseRejectionEventCoercer, StringCoercer } from '../../vendor/posthog-js/packages/core/src/error-tracking/coercers'
export { createDefaultStackParser } from '../../vendor/posthog-js/packages/core/src/error-tracking/parsers'
export { ExceptionStepsBuffer, resolveExceptionStepsConfig, stripReservedExceptionStepFields, EXCEPTION_STEP_INTERNAL_FIELDS } from '../../vendor/posthog-js/packages/core/src/error-tracking/exception-steps'
export { getInjectedReleaseId } from '../../vendor/posthog-js/packages/core/src/error-tracking/release'
