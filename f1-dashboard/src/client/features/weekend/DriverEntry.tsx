import type {
  Driver as DriverModel,
  ScheduledSession,
  Weekend,
} from '../../../shared/contracts/results.js';

import { weekendHref } from '../../../shared/domain/weekend.js';
import { MotionLink } from '../../components/motion.js';

import { FavouriteButton, useFavourites } from '../favourites/Favourites.js';

export function DriverEntry({
  driver,
  weekend,
  session,
  selected,
}: {
  driver: DriverModel;
  weekend: Weekend;
  session: ScheduledSession;
  selected: number | null;
}) {
  const favourites = useFavourites();
  const color =
    typeof driver.color === 'string' && /^#[a-f\d]{6}$/i.test(driver.color)
      ? driver.color
      : '#999faa';
  const favourite = favourites.isDriver(driver) || favourites.isTeam(driver.team);
  const name = <span className="entrant-name">{driver.name}</span>;
  return (
    <div
      className={`entrant ${favourite ? 'favourite-entrant' : ''}`}
      data-favourite={favourite ? 'true' : undefined}
    >
      <span className="team-stripe" style={{ '--team-color': color }} aria-hidden="true" />
      <div className="entrant-details">
        <div className="entrant-primary">
          {driver.number !== null ? (
            <MotionLink
              className={`driver-link ${driver.number === selected ? 'selected' : ''}`}
              href={weekendHref(weekend.season, weekend.round, session.slug, driver.number)}
              aria-label={`Analyze ${driver.name} laps`}
            >
              {name}
            </MotionLink>
          ) : (
            name
          )}
          <FavouriteButton kind="drivers" value={driver} name={driver.name} />
        </div>
        <div className="entrant-secondary">
          <span className="entrant-team">{driver.team || 'Team unavailable'}</span>
          {driver.team && <FavouriteButton kind="teams" value={driver.team} name={driver.team} />}
        </div>
      </div>
    </div>
  );
}
