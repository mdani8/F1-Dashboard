import type { DashboardState, Retry } from '../../app/types.js';

import { validateStandings } from '../../../shared/contracts/jolpica.js';

import { CachedNotice, dash, Stamp, teamColors } from '../../components/data-display.js';
import { ChangedCell, MotionButton } from '../../components/motion.js';
import { FavouriteButton, useFavourites } from '../favourites/Favourites.js';

export function StandingsTable({
  result,
  error,
  season,
  type,
  timezone,
  onRetry,
}: {
  result: DashboardState['drivers'];
  error: string | null;
  season: string | undefined;
  type: 'drivers' | 'constructors';
  timezone: string;
  onRetry: Retry;
}) {
  const favourites = useFavourites();
  if (error && !result)
    return (
      <p className="message" role="status">
        {error}{' '}
        <MotionButton className="retry" onClick={onRetry}>
          Retry
        </MotionButton>
      </p>
    );
  if (!result || !season || result.data.MRData.StandingsTable.season !== season)
    return (
      <p className="loading">Loading {type === 'drivers' ? 'driver' : 'constructor'} standings…</p>
    );
  const drivers = type === 'drivers';
  const list = validateStandings(
    result.data,
    season,
    drivers ? 'DriverStandings' : 'ConstructorStandings',
  );
  const rows = list?.[drivers ? 'DriverStandings' : 'ConstructorStandings'] || [];
  return (
    <>
      <CachedNotice section={result} onRetry={onRetry} />
      <p className="data-note">
        <strong>
          {season} {list ? `· After round ${list.round}` : '· Season standings'}
        </strong>
        <br />
        <Stamp at={result.at} timezone={timezone} />
      </p>
      {rows.length ? (
        <div
          className="table-wrap"
          tabIndex={0}
          role="region"
          aria-label="Scrollable championship standings"
        >
          <table aria-label={`${drivers ? 'Driver' : 'Constructor'} championship standings`}>
            <thead>
              <tr>
                {['POS', drivers ? 'DRIVER / TEAM' : 'CONSTRUCTOR', 'PTS', 'WINS'].map((label) => (
                  <th scope="col" key={label}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const teams = drivers
                  ? row.Constructors || []
                  : row.Constructor
                    ? [row.Constructor]
                    : [];
                const team = teams[0];
                const name = drivers
                  ? `${row.Driver?.givenName || ''} ${row.Driver?.familyName || ''}`.trim()
                  : row.Constructor?.name;
                const key = drivers
                  ? row.Driver?.driverId || row.Driver?.code || name
                  : row.Constructor?.constructorId || name;
                const favourite =
                  (drivers && favourites.isDriver(row.Driver)) ||
                  teams.some((item) => favourites.isTeam(item));
                return (
                  <tr
                    key={key}
                    className={favourite ? 'favourite-row' : undefined}
                    data-favourite={favourite ? 'true' : undefined}
                  >
                    <ChangedCell className="position" value={row.positionText || row.position}>
                      {row.positionText || row.position || '—'}
                    </ChangedCell>
                    <td>
                      <div className="entrant">
                        <span
                          className="team-stripe"
                          style={{
                            '--team-color': teamColors[team?.constructorId || ''] || '#a4a8b4',
                          }}
                          aria-hidden="true"
                        />
                        <div className="entrant-details">
                          <div className="entrant-primary">
                            <span className="entrant-name">{name || 'Unknown entrant'}</span>
                            {drivers ? (
                              <FavouriteButton
                                kind="drivers"
                                value={row.Driver}
                                name={name || 'Unknown entrant'}
                              />
                            ) : (
                              <FavouriteButton
                                kind="teams"
                                value={row.Constructor}
                                name={name || 'Unknown entrant'}
                              />
                            )}
                          </div>
                          {drivers && (
                            <div className="entrant-secondary">
                              <span className="entrant-team">
                                {teams.map((item) => item.name).join(' / ')}
                              </span>
                              <FavouriteButton
                                kind="teams"
                                value={team}
                                name={team?.name || 'Team'}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <ChangedCell className="points" value={row.points}>
                      {dash(row.points)}
                    </ChangedCell>
                    <ChangedCell className="wins" value={row.wins}>
                      {dash(row.wins)}
                    </ChangedCell>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="message">
          No championship standings have been published for this season yet.
        </p>
      )}
    </>
  );
}
