type RiffCaptureSource = {
  id: string;
  name: string;
  thumbnail: string;
  appIcon: string | null;
};

type AfterplayDesktopBridge = {
  isDesktop: true;
  platform: string;
  listCaptureSources: () => Promise<RiffCaptureSource[]>;
  selectCaptureSource: (sourceId: string) => Promise<RiffCaptureSource>;
  getScreenPermission: () => Promise<string>;
};

interface Window {
  afterplayDesktop?: AfterplayDesktopBridge;
}
