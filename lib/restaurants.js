// Burger Blastoff restaurant lineup.
//
// To add a restaurant: copy an entry, give it a new unique `id`, and set active: true.
// Existing buyers get a coupon for it automatically the next time their passport is opened.
// Never change an existing restaurant's `id` (coupons are tied to it).
//
// `confirmed: false` means the offer wording still needs to be checked with the restaurant.

export const RESTAURANTS = [
  // ---------------- NASHVILLE ----------------
  {
    id: 'nash-caney-fork', city: 'nashville', active: true, confirmed: true,
    name: 'Caney Fork Restaurant',
    address: '2400 Music Valley Dr, Nashville, TN 37214',
    deal: 'FREE BURGER',
    condition: 'with the purchase of an appetizer',
    terms: ['Dine-in only', 'Limit 1 per group', 'Eligible burgers only (ask your server)'],
  },
  {
    id: 'nash-caddy-briley', city: 'nashville', active: true, confirmed: false,
    name: 'Tha Caddy Shack – Briley Pkwy',
    address: '845 Briley Pkwy, Nashville, TN 37217',
    deal: 'FREE BURGER',
    condition: 'with the purchase of any side',
    terms: ['Limit 1 per group'],
  },
  {
    id: 'nash-caddy-downtown', city: 'nashville', active: true, confirmed: false,
    name: 'Tha Caddy Shack – Downtown',
    address: '115 2nd Ave N, Nashville, TN 37201',
    deal: 'FREE BURGER',
    condition: 'with the purchase of any side',
    terms: ['Dine-in only', 'Limit 1 per group'],
  },
  {
    id: 'nash-fozzys-franklin', city: 'nashville', active: true, confirmed: false,
    name: "Fozzy's Bar & Grill – Franklin",
    address: '600A Frazier Dr, Ste 135, Franklin, TN',
    deal: 'FREE BURGER',
    condition: 'with the purchase of a full-priced menu item',
    terms: ['Dine-in only'],
  },
  {
    id: 'nash-fozzys-spring-hill', city: 'nashville', active: true, confirmed: false,
    name: "Fozzy's Bar & Grill – Spring Hill",
    address: '150 Stephen P. Yokich Pkwy, Spring Hill, TN 37174',
    deal: 'FREE BURGER',
    condition: 'with the purchase of a full-priced menu item',
    terms: ['Dine-in only'],
  },
  {
    id: 'nash-little-bite', city: 'nashville', active: true, confirmed: false,
    name: 'Little Bite of Everything',
    address: '124 South Main St, Dickson, TN 37055',
    deal: 'FREE BURGER',
    condition: 'with the purchase of any additional item',
    terms: ['Dine-in only'],
  },
  {
    id: 'nash-twisted-fork', city: 'nashville', active: true, confirmed: false,
    name: 'Twisted Fork',
    address: '214 Village Sq, Ste 100, Pleasant View, TN 37146',
    deal: 'FREE BURGER',
    condition: 'with the purchase of any additional item',
    terms: ['Dine-in only'],
  },
  {
    id: 'nash-edessa', city: 'nashville', active: true, confirmed: false,
    name: 'Edessa Burger & Pizza',
    address: '2631 Nolensville Pike, Nashville, TN 37211',
    deal: 'FREE BURGER',
    condition: 'with the purchase of any other item',
    terms: [],
  },
  {
    id: 'nash-butchertown', city: 'nashville', active: true, confirmed: false,
    name: 'Butchertown Hall',
    address: '1416 4th Ave N, Nashville, TN',
    deal: 'FREE BURGER',
    condition: 'with the purchase of any other item',
    terms: [],
  },
  {
    id: 'nash-chefs-market', city: 'nashville', active: true, confirmed: false,
    name: "Chef's Market",
    address: '900 Conference Dr, Goodlettsville, TN 37072',
    deal: 'FREE BURGER',
    condition: 'with the purchase of any other item',
    terms: [],
  },
  {
    id: 'nash-sticky-rice', city: 'nashville', active: true, confirmed: false,
    name: 'Sticky Rice Express',
    address: "Nashville Farmers' Market, 900 Rosa L. Parks Blvd, Nashville, TN",
    deal: 'FREE BURGER',
    condition: 'with the purchase of any other item',
    terms: ['Check stickyriceexpresscafe.com for hours'],
  },
  {
    id: 'nash-honey-fired', city: 'nashville', active: true, confirmed: false,
    name: 'Honey Fired BBQ',
    address: '8127 Sawyer Brown Rd, Nashville, TN 37221',
    deal: 'FREE BURGER',
    condition: 'with the purchase of any other item',
    terms: [],
  },
  {
    id: 'nash-breads', city: 'nashville', active: false, confirmed: false,
    name: 'Breads Food',
    address: '614 Arbor Ridge Dr',
    deal: 'FREE BURGER',
    condition: 'with the purchase of any other item',
    terms: ['Pick-up only'],
  },

  // ---------------- PHOENIX ----------------
  {
    id: 'phx-happys', city: 'phoenix', active: true, confirmed: true,
    name: "Happy's Hamburgers",
    address: '10435 N Scottsdale Rd, Scottsdale, AZ 85253',
    deal: 'FREE DOUBLE CHEESEBURGER',
    condition: 'with the purchase of 1 side and a drink',
    terms: ['Dine-in only'],
  },
  {
    id: 'phx-jims', city: 'phoenix', active: true, confirmed: true,
    name: "Jim's Burgers & Eggs",
    address: '17019 W Greenway Rd, Surprise, AZ 85388',
    deal: 'FREE 1/4 LB CHAR BURGER',
    condition: 'with the purchase of fries and a drink',
    terms: ['Dine-in only'],
  },
  {
    id: 'phx-frashers', city: 'phoenix', active: true, confirmed: true,
    name: "Frasher's Tavern",
    address: '4180 N Drinkwater Blvd, Scottsdale, AZ 85251',
    deal: 'FREE CHEESEBURGER',
    condition: 'with the purchase of an appetizer (fries included)',
    terms: ['Dine-in only', 'Limit 1 per group'],
  },
  {
    id: 'phx-culinary-gangster', city: 'phoenix', active: true, confirmed: true,
    name: 'Culinary Gangster',
    address: '14891 N Northsight Blvd, Ste 135, Scottsdale, AZ 85260',
    deal: 'FREE CHEESEBURGER',
    condition: 'with the purchase of fries & a drink, or a starter',
    terms: ['Dine-in only', 'Scottsdale location only'],
  },
  {
    id: 'phx-blu', city: 'phoenix', active: true, confirmed: true,
    name: 'Blu Burger Grille',
    address: '32409 N Scottsdale Rd, Scottsdale, AZ 85266',
    deal: 'BUY ONE BURGER, GET ONE FREE',
    condition: 'second burger of equal or lesser value, with the purchase of 2 beverages',
    terms: ['Dine-in only', '11am–5pm', 'Excludes happy hour'],
  },
  {
    id: 'phx-roadrunner', city: 'phoenix', active: true, confirmed: true,
    name: 'Roadrunner Restaurant & Saloon',
    address: '47801 N Black Canyon Hwy, New River, AZ 85087',
    deal: '$15 CLASSIC CHEESEBURGER + DOMESTIC BEER',
    condition: 'a classic cheeseburger and a domestic bottle of beer for $15',
    terms: ['Dine-in only', 'Monday–Friday, 2–5pm'],
  },
  {
    id: 'phx-stumblinas', city: 'phoenix', active: true, confirmed: false,
    name: "Stumblina's Cafe",
    address: '6268 E Cave Creek Rd, Cave Creek, AZ 85331',
    deal: 'FREE BURGER',
    condition: 'with the purchase of any other item',
    terms: ['Dine-in only'],
  },
  {
    id: 'phx-copper-bull', city: 'phoenix', active: true, confirmed: false,
    name: 'Copper Bull',
    address: '30855 N Cave Creek Rd, Ste 138, Cave Creek, AZ 85331',
    deal: 'FREE BURGER',
    condition: 'with the purchase of any other item',
    terms: [],
  },
  {
    id: 'phx-whiskey-wings', city: 'phoenix', active: true, confirmed: false,
    name: 'Whiskey and Wings',
    address: '34406 N Black Mountain Pkwy, Cave Creek, AZ 85331',
    deal: 'FREE BURGER',
    condition: 'with the purchase of any other item',
    terms: [],
  },
];

// Rules printed on every coupon, after the restaurant's own terms
export const UNIVERSAL_TERMS = [
  'One-time use; void once redeemed',
  'Not valid with other offers',
  'Please tip on the full value',
];

export function restaurantsFor(cityId) {
  return RESTAURANTS.filter((r) => r.city === cityId && r.active);
}

export function restaurantById(id) {
  return RESTAURANTS.find((r) => r.id === id) || null;
}
