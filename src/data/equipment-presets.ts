// ============================================================
// EQUIPMENT CATALOG — an industry-standard set of camera, RF and
// aerial gear the "Add from catalog" flows prefill records from.
// ============================================================
// The store never holds a preset — only a record's `presetId`. The
// illustrations are drawn inline by <EquipmentImage> from the `silhouette`
// key, so nothing here is a bundled binary or store data.

export type EquipmentCategory =
  | "cinema_camera"
  | "mirrorless"
  | "lens"
  | "support"
  | "wireless_mic"
  | "wireless_tx"
  | "video_tx"
  | "ifb"
  | "comms"
  | "drone";

/** Which inline silhouette <EquipmentImage> draws for a preset. */
export type SilhouetteKey =
  | "cinema_camera"
  | "mirrorless"
  | "box_camera"
  | "lens"
  | "support"
  | "handheld_tx"
  | "bodypack"
  | "headset"
  | "video_tx"
  | "quadcopter"
  | "generic";

export interface EquipmentPreset {
  id: string;
  manufacturer: string;
  model: string;
  category: EquipmentCategory;
  /** One real spec line — sensor/res/mount, or band/range. */
  specs: string;
  silhouette: SilhouetteKey;
  /** For RF presets, the value written to `rfEquipment.type`. */
  rfType?: string;
  /** For drone presets. */
  weightGrams?: number;
}

// ------------------------------------------------------------
// Cameras & glass
// ------------------------------------------------------------
export const CAMERA_PRESETS: EquipmentPreset[] = [
  // ARRI
  { id: "cam_arri_alexa35", manufacturer: "ARRI", model: "ALEXA 35", category: "cinema_camera", silhouette: "cinema_camera", specs: "S35 4.6K ALEV 4 · 17 stops · LPL/PL · ARRIRAW" },
  { id: "cam_arri_minilf", manufacturer: "ARRI", model: "ALEXA Mini LF", category: "cinema_camera", silhouette: "cinema_camera", specs: "Large-format 4.5K · LPL mount · ARRIRAW/ProRes" },
  // RED
  { id: "cam_red_vraptor", manufacturer: "RED", model: "V-RAPTOR 8K VV", category: "cinema_camera", silhouette: "box_camera", specs: "8K VV 35.4MP · RF/PL · REDCODE RAW" },
  { id: "cam_red_komodox", manufacturer: "RED", model: "KOMODO-X 6K", category: "cinema_camera", silhouette: "box_camera", specs: "S35 6K global shutter · RF mount · R3D" },
  // Sony
  { id: "cam_sony_venice2", manufacturer: "Sony", model: "VENICE 2", category: "cinema_camera", silhouette: "cinema_camera", specs: "Full-frame 8.6K · E/PL · X-OCN" },
  { id: "cam_sony_fx9", manufacturer: "Sony", model: "FX9", category: "cinema_camera", silhouette: "box_camera", specs: "Full-frame 6K · E mount · Dual Base ISO" },
  { id: "cam_sony_fx6", manufacturer: "Sony", model: "FX6", category: "cinema_camera", silhouette: "box_camera", specs: "Full-frame 4K · E mount · S-Cinetone" },
  { id: "cam_sony_fx3", manufacturer: "Sony", model: "FX3", category: "mirrorless", silhouette: "mirrorless", specs: "Full-frame 4K · E mount · compact Cinema Line" },
  { id: "cam_sony_a7s3", manufacturer: "Sony", model: "A7S III", category: "mirrorless", silhouette: "mirrorless", specs: "Full-frame 12MP 4K120 · E mount" },
  // Canon
  { id: "cam_canon_c500ii", manufacturer: "Canon", model: "EOS C500 Mark II", category: "cinema_camera", silhouette: "box_camera", specs: "Full-frame 5.9K · EF/PL · Cinema RAW Light" },
  { id: "cam_canon_c70", manufacturer: "Canon", model: "EOS C70", category: "cinema_camera", silhouette: "box_camera", specs: "S35 4K DGO · RF mount · XF-AVC" },
  { id: "cam_canon_r5c", manufacturer: "Canon", model: "EOS R5 C", category: "mirrorless", silhouette: "mirrorless", specs: "Full-frame 8K · RF mount · Cinema RAW Light" },
  // Blackmagic
  { id: "cam_bm_ursa12k", manufacturer: "Blackmagic", model: "URSA Mini Pro 12K", category: "cinema_camera", silhouette: "cinema_camera", specs: "S35 12K · PL/EF/F · Blackmagic RAW" },
  { id: "cam_bm_pocket6k", manufacturer: "Blackmagic", model: "Pocket Cinema 6K Pro", category: "mirrorless", silhouette: "mirrorless", specs: "S35 6K · EF mount · BRAW" },
  // Panasonic
  { id: "cam_pana_s1h", manufacturer: "Panasonic", model: "LUMIX S1H", category: "mirrorless", silhouette: "mirrorless", specs: "Full-frame 6K · L mount · V-Log" },
  { id: "cam_pana_gh6", manufacturer: "Panasonic", model: "LUMIX GH6", category: "mirrorless", silhouette: "mirrorless", specs: "MFT 5.7K · M4/3 mount · ProRes internal" },

  // A representative set of glass + support so the catalog covers a build.
  { id: "lens_arri_signature", manufacturer: "ARRI", model: "Signature Prime Set", category: "lens", silhouette: "lens", specs: "LPL · T1.8 · 12–280mm covered" },
  { id: "lens_cooke_s7i", manufacturer: "Cooke", model: "S7/i Full Frame Plus", category: "lens", silhouette: "lens", specs: "PL/LPL · T2.0 · full-frame primes" },
  { id: "lens_zeiss_supreme", manufacturer: "Zeiss", model: "Supreme Prime Set", category: "lens", silhouette: "lens", specs: "PL/LPL · T1.5 · full-frame primes" },
  { id: "lens_canon_cne", manufacturer: "Canon", model: "CN-E Cine Prime Set", category: "lens", silhouette: "lens", specs: "EF/PL · T1.3–T1.5 · 4K cine primes" },
  { id: "sup_oconnor_2575", manufacturer: "O'Connor", model: "2575D Fluid Head", category: "support", silhouette: "support", specs: "Payload to 90 lb · Mitchell/150mm ball" },
  { id: "sup_dji_ronin2", manufacturer: "DJI", model: "Ronin 2", category: "support", silhouette: "support", specs: "3-axis gimbal · payload to 30 lb" },
];

// ------------------------------------------------------------
// RF / comms / wireless
// ------------------------------------------------------------
export const RF_PRESETS: EquipmentPreset[] = [
  { id: "rf_senn_ew500", manufacturer: "Sennheiser", model: "EW 500 G4", category: "wireless_mic", rfType: "Wireless Mic", silhouette: "bodypack", specs: "UHF 470–714 MHz · 88-set · 42 MHz bandwidth" },
  { id: "rf_senn_2000", manufacturer: "Sennheiser", model: "Digital 6000 (EM 2000)", category: "wireless_mic", rfType: "Wireless Mic", silhouette: "bodypack", specs: "UHF 470–714 MHz · true-diversity dual" },
  { id: "rf_shure_axient", manufacturer: "Shure", model: "Axient Digital AD4Q", category: "wireless_mic", rfType: "Wireless Mic", silhouette: "bodypack", specs: "UHF 470–1805 MHz · quad · Dante" },
  { id: "rf_shure_ulxd", manufacturer: "Shure", model: "ULX-D", category: "wireless_mic", rfType: "Wireless Mic", silhouette: "bodypack", specs: "UHF 470–636 MHz · AES-256 · digital diversity" },
  { id: "rf_lectro_dsr4", manufacturer: "Lectrosonics", model: "DSR4", category: "wireless_mic", rfType: "Wireless Mic", silhouette: "bodypack", specs: "470–608 MHz · 4-ch digital slot receiver" },
  { id: "rf_lectro_dbu", manufacturer: "Lectrosonics", model: "DBu", category: "wireless_tx", rfType: "Wireless TX", silhouette: "handheld_tx", specs: "470–614 MHz · digital beltpack TX" },
  { id: "rf_teradek_bolt6", manufacturer: "Teradek", model: "Bolt 6 LT 1500", category: "video_tx", rfType: "Video TX", silhouette: "video_tx", specs: "5 GHz · zero-delay HD · 1500 ft" },
  { id: "rf_holly_mars4k", manufacturer: "Hollyland", model: "Mars 4K", category: "video_tx", rfType: "Video TX", silhouette: "video_tx", specs: "5 GHz · 4K HDMI/SDI · 450 ft" },
  { id: "rf_holly_cosmoc1", manufacturer: "Hollyland", model: "Cosmo C1 Pro", category: "video_tx", rfType: "Video TX", silhouette: "video_tx", specs: "SDI/HDMI · 1200 ft · low latency" },
  { id: "rf_eartec_ultralite", manufacturer: "Eartec", model: "UltraLITE", category: "comms", rfType: "Comms Headset", silhouette: "headset", specs: "Full-duplex · up to 9 users · 2.4 GHz" },
];

// ------------------------------------------------------------
// Drones / aerial (DJI-led, with weight + camera specs)
// ------------------------------------------------------------
export const DRONE_PRESETS: EquipmentPreset[] = [
  { id: "drone_dji_mavic3pro", manufacturer: "DJI", model: "Mavic 3 Pro", category: "drone", silhouette: "quadcopter", weightGrams: 958, specs: "Triple cam · 4/3 CMOS 20MP · 5.1K/50 · 43 min" },
  { id: "drone_dji_mavic3cine", manufacturer: "DJI", model: "Mavic 3 Cine", category: "drone", silhouette: "quadcopter", weightGrams: 899, specs: "4/3 Hasselblad · Apple ProRes 422 HQ · 1TB SSD" },
  { id: "drone_dji_air3", manufacturer: "DJI", model: "Air 3", category: "drone", silhouette: "quadcopter", weightGrams: 720, specs: "Dual cam 1/1.3\" · 4K/100 HDR · 46 min" },
  { id: "drone_dji_mini4pro", manufacturer: "DJI", model: "Mini 4 Pro", category: "drone", silhouette: "quadcopter", weightGrams: 249, specs: "1/1.3\" · 4K/100 HDR · sub-250g · omnidirectional" },
  { id: "drone_dji_inspire3", manufacturer: "DJI", model: "Inspire 3", category: "drone", silhouette: "quadcopter", weightGrams: 3995, specs: "Full-frame 8K CineCore · dual op · RTK" },
  { id: "drone_dji_avata2", manufacturer: "DJI", model: "Avata 2 (FPV)", category: "drone", silhouette: "quadcopter", weightGrams: 377, specs: "1/1.3\" · 4K/60 · cinewhoop FPV · motion control" },
  { id: "drone_dji_agrast40", manufacturer: "DJI", model: "Agras T40 (heavy lift)", category: "drone", silhouette: "quadcopter", weightGrams: 38000, specs: "Coaxial twin-rotor · 40 kg payload class" },
];

export const ALL_PRESETS: EquipmentPreset[] = [
  ...CAMERA_PRESETS,
  ...RF_PRESETS,
  ...DRONE_PRESETS,
];

const BY_ID = new Map(ALL_PRESETS.map((p) => [p.id, p]));

export function equipmentPresetById(id: string | undefined): EquipmentPreset | undefined {
  return id ? BY_ID.get(id) : undefined;
}

export const CATEGORY_LABELS: Record<EquipmentCategory, string> = {
  cinema_camera: "Cinema Camera",
  mirrorless: "Mirrorless / Compact",
  lens: "Lenses",
  support: "Support / Gimbal",
  wireless_mic: "Wireless Mic",
  wireless_tx: "Wireless TX",
  video_tx: "Video TX",
  ifb: "IFB",
  comms: "Comms",
  drone: "Drone",
};
