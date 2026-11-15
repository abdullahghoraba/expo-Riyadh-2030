/** GeoJSON files imported as raw text (angular.json `loader`: { ".geojson": "text" }). */
declare module '*.geojson' {
  const text: string;
  export default text;
}
