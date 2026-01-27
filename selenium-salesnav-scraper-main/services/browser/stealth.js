const applyStealth = (options) => {
  options.addArguments(
    "--disable-blink-features=AutomationControlled",
    "--disable-infobars",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-sync",
    "--disable-default-apps",
    "--disable-domain-reliability",
    "--disable-features=Translate,MediaRouter,OptimizationHints,NotificationTriggers",
    "--disable-features=WebRtcHideLocalIpsWithMdns,WebRtcAllowLegacyTLSProtocols",
    "--no-first-run",
    "--no-default-browser-check"
  );
  if (typeof options.excludeSwitches === "function") {
    options.excludeSwitches("enable-automation");
    options.excludeSwitches("disable-extensions");
  }
  if (typeof options.setExperimentalOption === "function") {
    options.setExperimentalOption("excludeSwitches", ["enable-automation", "disable-extensions"]);
    options.setExperimentalOption("useAutomationExtension", false);
  }
  options.setUserPreferences({
    "credentials_enable_service": false,
    "profile.password_manager_enabled": false,
    "webrtc.ip_handling_policy": "disable_non_proxied_udp",
    "webrtc.multiple_routes_enabled": false,
    "webrtc.nonproxied_udp_enabled": false,
    "extensions.ui.developer_mode": true,
    "profile.exit_type": "Normal",
    "profile.exited_cleanly": true,
    "session.restore_on_startup": 5,
    "session.startup_urls": ["chrome://newtab"],
  });
};

module.exports = {
  applyStealth,
};
