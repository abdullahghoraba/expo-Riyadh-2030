/** Typed shapes of the site "database" (public/data/*.json|geojson) and shared domain types. */

export type LonLat = [number, number];
export type LonLatZ = [number, number, number];

// ---------------- GeoJSON ----------------
export interface PointGeometry { type: 'Point'; coordinates: LonLat }
export interface LineStringGeometry { type: 'LineString'; coordinates: LonLat[] }
export interface PolygonGeometry { type: 'Polygon'; coordinates: LonLat[][] }
export type Geometry = PointGeometry | LineStringGeometry | PolygonGeometry;

export interface Feature<G extends Geometry, P> { type: 'Feature'; properties: P; geometry: G }

export interface CollectionMetadata {
  source: string;
  generated: string;
  unit?: string;
  hours?: string;
}

export interface FeatureCollection<G extends Geometry, P> {
  type: 'FeatureCollection';
  name: string;
  metadata?: CollectionMetadata;
  features: Feature<G, P>[];
}

// ---------------- feature properties (see reference tools/generate-data.js) ----------------
export type StreetKind = 'boulevard' | 'avenue' | 'street' | 'lane' | 'promenade' | 'service';
export interface StreetProps { sid: string; name: string; nameAr: string; kind: StreetKind; width: number; length: number }

export interface DistrictProps { did: string; name: string; nameAr: string; color: string; note: string }

export type PlotDataStatus = 'available' | 'taken';
/** Status shown in the UI (data status combined with selection / submission). */
export type PlotStatus = 'available' | 'taken' | 'selected' | 'pending';
export interface PlotProps {
  pid: string; district: string; districtName: string; status: PlotDataStatus; size: number; area: number; rotation: number;
  entranceSide: number; cx: number; cy: number; ex: number; ey: number; style: string; floors: number; palette: number; owner: string;
}

export type BuildingType = 'national' | 'corporate' | 'hospitality' | 'retail' | 'media' | 'service' | 'gate' | 'metro' | 'saudi' | 'theme';
export interface BuildingProps {
  bid: string; height: number; floors: number; w: number; d: number; rotation: number; cx: number; cy: number;
  name: string; type: BuildingType; phase: number; nameAr?: string; style?: string; palette?: number;
}

export type ServiceType = 'restroom' | 'prayer' | 'aid' | 'food' | 'visitor' | 'servicegate' | 'metro';
export interface ServiceProps {
  sid: string; type: ServiceType; name: string; location: string; district: string; open: string; accessible: number;
  capacity?: number; outlets?: number; ambulance?: number; lanes?: number; lines?: string; headwayMin?: number;
}

export type LandscapeKind = 'site' | 'plaza' | 'garden' | 'water' | 'median' | 'island';
export interface LandscapeProps { kind: LandscapeKind; name: string }

export interface ParkingProps { lid: string; name: string; capacity: number; evChargers: number }
export interface VehicleProps { model: string; heading: number }
export interface TreeProps { species: string; height: number; rot: number }
export interface LightProps { heading: number }

export type UtilityType = 'water' | 'power' | 'telecom' | 'cooling';
export interface UtilityProps { uid: string; type: UtilityType; name: string; depth: number; diameter: number; material: string; street: string; installed: number }

export interface MetroProps { name: string; nameAr: string; deck: number; kind: string }

/** Crowd hexagon: `hid`, `peak` and hourly values `h0` … `h23` (people per 1,000 m²). */
export interface CrowdProps { hid: string; peak: number; [hour: `h${number}`]: number }

export type StreetCollection = FeatureCollection<LineStringGeometry, StreetProps>;
export type DistrictCollection = FeatureCollection<PolygonGeometry, DistrictProps>;
export type PlotCollection = FeatureCollection<PolygonGeometry, PlotProps>;
export type BuildingCollection = FeatureCollection<PolygonGeometry, BuildingProps>;
export type ServiceCollection = FeatureCollection<PointGeometry, ServiceProps>;
export type LandscapeCollection = FeatureCollection<PolygonGeometry, LandscapeProps>;
export type ParkingCollection = FeatureCollection<PolygonGeometry, ParkingProps>;
export type VehicleCollection = FeatureCollection<PointGeometry, VehicleProps>;
export type TreeCollection = FeatureCollection<PointGeometry, TreeProps>;
export type LightCollection = FeatureCollection<PointGeometry, LightProps>;
export type UtilityCollection = FeatureCollection<LineStringGeometry, UtilityProps>;
export type MetroCollection = FeatureCollection<LineStringGeometry, MetroProps>;
export type CrowdCollection = FeatureCollection<PolygonGeometry, CrowdProps>;

// ---------------- site.json ----------------
export interface SiteFact { label: string; value: string }
export interface SiteDistrict {
  id: string; name: string; nameAr: string; color: string; note: string;
  block: { center: LonLat; rotation: number };
}
export interface Site {
  name: string;
  nameAr: string;
  disclaimer: string;
  center: { lon: number; lat: number };
  walkingSpeedMpm: number;
  participant: { name: string; initials: string };
  station: LonLat;
  globe: LonLat;
  dates: { open: string; close: string };
  facts: SiteFact[];
  districts: SiteDistrict[];
}

// ---------------- narration.json ----------------
export interface NarrationStep { id: string; en: string; ar: string; arSpeech: string }
export interface Narration { imagine: NarrationStep[]; tour: NarrationStep[] }

// ---------------- the whole database ----------------
export const GEOJSON_FILES = ['streets', 'districts', 'plots', 'buildings', 'services', 'landscape', 'parking', 'vehicles', 'trees', 'lights', 'utilities', 'metro', 'crowd'] as const;
export type GeoJsonName = (typeof GEOJSON_FILES)[number];

export interface SiteData {
  site: Site;
  narration: Narration;
  streets: StreetCollection;
  districts: DistrictCollection;
  plots: PlotCollection;
  buildings: BuildingCollection;
  services: ServiceCollection;
  landscape: LandscapeCollection;
  parking: ParkingCollection;
  vehicles: VehicleCollection;
  trees: TreeCollection;
  lights: LightCollection;
  utilities: UtilityCollection;
  metro: MetroCollection;
  crowd: CrowdCollection;
}

// ---------------- app-level types ----------------
export type RenderMode = 'realistic' | 'blueprint' | 'sketch';
export type LightMode = 'day' | 'sunset' | 'night';
export type WeatherMode = 'sunny' | 'cloudy' | 'rainy' | 'foggy';
export type Lang = 'en' | 'ar';
export type CadTheme = 'blueprint' | 'paper';
export type PanelTab = 'plot' | 'pavilion' | 'analysis' | 'layers' | 'insights';

/** Saved design choices for one plot (localStorage `expo.design`). */
export interface PlotDesign { style?: string; palette?: number; floors?: number; name?: string }
/** A submitted plot request (localStorage `expo.submitted`). */
export interface Submission { t: number; ref: string; note: string }

/** Parametric pavilion description (pavilion.js specFromPlot / specFromBuilding). */
export interface PavilionSpec {
  id: string;
  kind: 'plot' | 'building';
  name: string;
  label: string;
  btype: string;
  cx: number;
  cy: number;
  rot: number;
  side: number;
  W: number;
  D: number;
  oy: number;
  base: number;
  floors: number;
  style: string;
  palette: number;
  H: number;
}

/** Placement metadata returned by the pavilion builder. */
export interface PavilionMeta {
  center: LonLat;
  roofZ: number;
  height: number;
  frontHeading: number;
  door: LonLat;
  approach: LonLat;
  lobby: LonLat;
  hall: LonLat;
  roofFront: LonLat;
  roofCenter: LonLat;
}

/** Result of building the detailed pavilion model (graphics are ArcGIS Graphic instances). */
export interface PavilionDetail<TPlan = unknown, TGraphic = unknown> {
  graphics: TGraphic[];
  plan: TPlan;
  meta: PavilionMeta;
}

/** A "what's near" entry (app.js computeNear). */
export interface NearEntry {
  type: ServiceType;
  feature: Feature<PointGeometry, ServiceProps>;
  route: { coords: LonLat[]; length: number; node: number };
  len: number;
  min: number;
}
