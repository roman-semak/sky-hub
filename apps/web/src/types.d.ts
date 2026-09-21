declare module '*.svg' {
  /** Raw SVG markup; the build inlines it as text (see angular.json `loader`). */
  const content: string;
  export default content;
}
