import { defineConfig } from "vitepress";

// GitHub Pages: https://<user>.github.io/ha-device-floorplan/
// Change `base` if the repository gets another name.
export default defineConfig({
  title: "Device Floorplan",
  description: "Put your Home Assistant devices on your own floorplan, then see them live on your dashboard.",
  base: "/ha-device-floorplan/",
  lang: "en-GB",
  cleanUrls: true,
  lastUpdated: true,
  head: [["link", { rel: "icon", href: "/ha-device-floorplan/icon.png" }]],
  themeConfig: {
    logo: "/icon.png",
    nav: [
      { text: "Getting started", link: "/guide/what-is" },
      { text: "Using Device Floorplan", link: "/using/editor" },
      { text: "Floorplan images", link: "/images/choosing" },
      { text: "Reference", link: "/reference/card" },
    ],
    sidebar: [
      {
        text: "Getting started",
        items: [
          { text: "What is Device Floorplan?", link: "/guide/what-is" },
          { text: "Install", link: "/guide/install" },
          { text: "Your first plan", link: "/guide/first-plan" },
        ],
      },
      {
        text: "Using Device Floorplan",
        items: [
          { text: "The editor", link: "/using/editor" },
          { text: "1 · Measure", link: "/using/measure" },
          { text: "2 · Mark rooms", link: "/using/rooms" },
          { text: "3 · Place devices", link: "/using/devices" },
          { text: "Layers", link: "/using/layers" },
          { text: "Floors and plans", link: "/using/floors" },
          { text: "New and removed devices", link: "/using/new-devices" },
          { text: "I'm ready: put it on a dashboard", link: "/using/ready" },
          { text: "Export and import", link: "/using/export" },
        ],
      },
      {
        text: "Floorplan images",
        items: [
          { text: "Choosing an image", link: "/images/choosing" },
          { text: "Turn your sketch into a floorplan in 10 minutes", link: "/images/sketch" },
          { text: "Sample plans", link: "/images/samples" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "Dashboard card", link: "/reference/card" },
          { text: "Entities and attributes", link: "/reference/entities" },
          { text: "Actions, events and blueprint", link: "/reference/automations" },
          { text: "Keyboard shortcuts", link: "/reference/keyboard" },
          { text: "Privacy and stored data", link: "/reference/privacy" },
        ],
      },
      {
        text: "Help",
        items: [
          { text: "FAQ and troubleshooting", link: "/help/faq" },
          { text: "Changelog", link: "/help/changelog" },
        ],
      },
    ],
    search: { provider: "local" },
    outline: { level: [2, 3], label: "On this page" },
    socialLinks: [{ icon: "github", link: "https://github.com/JohnKotrolos/ha-device-floorplan" }],
    editLink: { pattern: "https://github.com/JohnKotrolos/ha-device-floorplan/edit/main/docs/:path", text: "Suggest a change to this page" },
    footer: { message: "Device Floorplan for Home Assistant", copyright: "Not affiliated with the Home Assistant project." },
  },
});
