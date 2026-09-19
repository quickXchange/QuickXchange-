export type AppBuildInfo = {
  buildId: string;
  commit: string;
  deployedAt: string;
  environment: string;
};

declare const __API_BUILD_METADATA__: Omit<AppBuildInfo, "environment">;

const generated = __API_BUILD_METADATA__;

export const apiBuildInfo: AppBuildInfo = Object.freeze({
  buildId: process.env.APP_BUILD_ID?.trim() || generated.buildId,
  commit: process.env.APP_COMMIT?.trim() || generated.commit,
  deployedAt: process.env.DEPLOYED_AT?.trim() || generated.deployedAt,
  environment: process.env.NODE_ENV || "development",
});