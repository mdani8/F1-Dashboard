import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ResultsService } from '../features/results/results-service.js';
import { sendJson } from './responses.js';

export async function handleApi(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  pathname: string,
  service: ResultsService,
): Promise<void> {
  const refresh = url.searchParams.get('refresh') === '1';
  const proxy =
    /^\/api\/jolpica\/(current\/races\/|20\d{2}\/(?:driverstandings|constructorstandings)\/)$/.exec(
      pathname,
    );
  if (proxy) {
    const result = await service.getJolpica(proxy[1]!, refresh);
    sendJson(request, response, 200, result.data, {
      'X-Data-At': String(result.at),
      'X-Data-Stale': String(result.stale),
    });
    return;
  }
  const track = /^\/api\/weekends\/(20\d{2})\/([1-9]\d?)\/track$/.exec(pathname);
  if (track) {
    sendJson(request, response, 200, await service.getTrack(track[1]!, track[2]!, refresh));
    return;
  }
  const match =
    /^\/api\/weekends\/(20\d{2})\/([1-9]\d?)(?:\/sessions\/(practice-[123]|qualifying|sprint-qualifying|sprint|race)(\/laps)?)?$/.exec(
      pathname,
    );
  if (!match) {
    sendJson(request, response, 404, { message: 'Unknown API endpoint.' });
    return;
  }
  const season = match[1]!,
    round = match[2]!,
    slug = match[3];
  if (match[4] && slug) {
    const driver = url.searchParams.get('driver');
    if (!/^[1-9]\d{0,2}$/.test(driver || '')) {
      sendJson(request, response, 400, { message: 'Select a valid session driver number.' });
      return;
    }
    sendJson(
      request,
      response,
      200,
      await service.getLaps(season, round, slug, Number(driver), refresh),
    );
    return;
  }
  sendJson(
    request,
    response,
    200,
    slug
      ? await service.getSession(season, round, slug, refresh)
      : await service.getWeekend(season, round, refresh),
  );
}
