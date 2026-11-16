import { AppErrorHandler } from './app-error-handler';

describe('AppErrorHandler', () => {
  afterEach(() => vi.restoreAllMocks());

  it('quietly drops the known ArcGIS vector-tile race errors', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const handler = new AppErrorHandler();
    handler.handleError(new TypeError("Cannot read properties of null (reading 'getSprites')"));
    handler.handleError(new TypeError("Cannot read properties of null (reading 'getGlyphs')"));
    expect(error).not.toHaveBeenCalled();
    expect(debug).toHaveBeenCalledTimes(2);
  });

  it('still reports every other error', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    new AppErrorHandler().handleError(new TypeError("Cannot read properties of null (reading 'foo')"));
    expect(error).toHaveBeenCalled();
  });
});
