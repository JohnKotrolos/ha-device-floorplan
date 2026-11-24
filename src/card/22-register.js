window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "device-floorplan-card")) {
  window.customCards.push({
    type: "device-floorplan-card",
    name: "Device Floorplan",
    description: dfT("card.description"),
    preview: false,
    documentationURL: "https://johnkotrolos.github.io/ha-device-floorplan/reference/card",
  });
}
