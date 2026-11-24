// Restaurant lineups for every event.
//
// Each entry belongs to one event (`event: 'wings'`, etc.). Entries with no `event` are Burger Blastoff.
// A restaurant doing two events gets two entries, each with its own unique `id` and deal.
// To add a restaurant: copy an entry, give it a new unique `id`, and set active: true.
// Never change an existing restaurant's `id` (coupons are tied to it).
// To pull a restaurant, set active: false (don't delete the entry).

const LINEUP = [
  // ---------------- NASHVILLE ----------------
  {
    id: 'nash-caney-fork', city: 'nashville', active: true, confirmed: true,
    name: 'Caney Fork Restaurant',
    address: '2400 Music Valley Dr, Nashville, TN 37214',
    deal: 'FREE CLASSIC CHEESEBURGER',
    short: 'Free classic cheeseburger w/ purchase of an appetizer',
    condition: 'with the purchase of an appetizer (build-a-burger; toppings extra)',
    terms: ['Dine-in only', 'Limit 1 per group'],
  },
  {
    id: 'nash-caddy-briley', city: 'nashville', active: true, confirmed: true,
    name: 'Tha Caddy Shack – Briley Pkwy',
    address: '845 Briley Pkwy, Nashville, TN 37217',
    deal: 'FREE CHEESEBURGER',
    short: 'Free cheeseburger w/ purchase of any side',
    condition: 'with the purchase of any side',
    terms: ['Limit 1 per group'],
  },
  {
    id: 'nash-caddy-downtown', city: 'nashville', active: true, confirmed: true,
    name: 'Tha Caddy Shack – Downtown',
    address: '115 2nd Ave N, Nashville, TN 37201',
    deal: 'FREE CHEESEBURGER',
    short: 'Free cheeseburger w/ purchase of any side',
    condition: 'with the purchase of any side',
    terms: ['Dine-in only', 'Limit 1 per group'],
  },
  {
    id: 'nash-fozzys-franklin', city: 'nashville', active: true, confirmed: true,
    name: "Fozzy's Bar & Grill – Franklin",
    address: '600A Frazier Dr, Ste 135, Franklin, TN 37067',
    deal: "FREE FOZZY'S SMASHBURGER",
    short: 'Free smashburger w/ purchase of a full-priced item',
    condition: 'with the purchase of a full-priced menu item',
    terms: ['Dine-in only', 'Frazier Dr location only'],
  },
  {
    id: 'nash-fozzys-spring-hill', city: 'nashville', active: true, confirmed: true,
    name: "Fozzy's Bar & Grill – Spring Hill",
    address: '150 Stephen P. Yokich Pkwy, Spring Hill, TN 37174',
    deal: "FREE FOZZY'S SMASHBURGER",
    short: 'Free smashburger w/ purchase of a full-priced item',
    condition: 'with the purchase of a full-priced menu item',
    terms: ['Dine-in only', 'Spring Hill location only'],
  },
  {
    id: 'nash-little-bite', city: 'nashville', active: true, confirmed: true,
    name: 'Little Bite of Everything',
    address: '124 South Main St, Dickson, TN 37055',
    deal: 'FREE "OC" OR MAC & CHEESE BURGER',
    short: 'Free "OC" or Mac & Cheese Burger w/ purchase of an appetizer',
    condition: 'with the purchase of an appetizer',
    terms: ['Dine-in only'],
  },
  {
    id: 'nash-twisted-fork', city: 'nashville', active: true, confirmed: true,
    name: 'Twisted Fork',
    address: '214 Village Sq, Ste 100, Pleasant View, TN 37146',
    deal: 'FREE PLAIN JANE BURGER',
    short: 'Free Plain Jane Burger w/ purchase of a food item & drink',
    condition: 'with the purchase of any additional food item and a beverage',
    terms: ['Dine-in only'],
  },
  {
    id: 'nash-edessa', city: 'nashville', active: true, confirmed: true,
    name: 'Edessa Burger & Pizza',
    address: '2631 Nolensville Pike, Nashville, TN 37211',
    deal: 'BUY A PIZZA BURGER, GET A CHEESEBURGER FREE',
    short: 'Buy a Signature Pizza Burger, get a cheeseburger free',
    condition: 'buy 1 Signature Pizza Burger, get 1 cheeseburger free',
    terms: ['Dine-in only'],
  },
  {
    id: 'nash-chefs-market', city: 'nashville', active: true, confirmed: true,
    name: "Chef's Market",
    address: '900 Conference Dr, Goodlettsville, TN 37072',
    deal: 'FREE BURGER',
    short: 'Free burger w/ purchase of any food item',
    condition: 'with the purchase of any additional food item',
    terms: ['Dine-in only'],
  },
  {
    id: 'nash-sticky-rice', city: 'nashville', active: true, confirmed: true,
    name: 'Sticky Rice Express',
    address: "Nashville Farmers' Market, 900 Rosa L. Parks Blvd, Nashville, TN",
    deal: 'BUY ONE BURGER, GET ONE FREE',
    short: 'BOGO burger',
    condition: 'buy 1 burger, get 1 burger free',
    terms: ['Check stickyriceexpresscafe.com for hours'],
  },
  {
    id: 'nash-makeshift', city: 'nashville', active: true, confirmed: true,
    name: 'Makeshift',
    address: '811 Dickerson Pike, Ste A, Nashville, TN 37207',
    deal: 'FREE SMASH BURGER',
    short: 'Free smash burger w/ purchase of fries + a drink',
    condition: 'with the purchase of fries and a cocktail, mocktail or beer',
    terms: ['Dine-in only'],
  },
  {
    id: 'nash-uncle-lennys', city: 'nashville', active: true, confirmed: true,
    name: "Uncle Lenny's Country Cafe",
    address: '1710 Fairview Blvd, Fairview, TN 37062',
    deal: 'FREE WAGYU JAMES BURGER JR.',
    short: 'Free Wagyu James Burger Jr. w/ purchase of fries + a drink',
    condition: 'with the purchase of fries and a drink',
    terms: ['Dine-in only'],
  },
  {
    id: 'nash-fat-mos-east', city: 'nashville', active: true, confirmed: true,
    name: "Fat Mo's – East Nashville",
    address: '2608 Gallatin Pike, Nashville, TN 37216',
    deal: 'FREE LITTLE MO BURGER',
    short: 'Free Little Mo Burger w/ purchase of fries + a large drink',
    condition: 'with the purchase of fries and a large drink',
    terms: ['East Nashville location only'],
  },
  // No longer on the lineup sheet:
  { id: 'nash-butchertown', city: 'nashville', active: false, confirmed: false, name: 'Butchertown Hall', address: '1416 4th Ave N, Nashville, TN', deal: 'FREE BURGER', short: '', condition: '', terms: [] },
  { id: 'nash-honey-fired', city: 'nashville', active: false, confirmed: false, name: 'Honey Fired BBQ', address: '8127 Sawyer Brown Rd, Nashville, TN 37221', deal: 'FREE BURGER', short: '', condition: '', terms: [] },
  // Pending:
  {
    id: 'nash-breads', city: 'nashville', active: false, confirmed: false,
    name: 'Breads Food',
    address: '614 Arbor Ridge Dr',
    deal: 'BUY 1 BURGER, GET 1 FREE',
    short: 'Buy 1 burger, get 1 free (pick-up)',
    condition: 'buy 1 burger, get 1 burger free',
    terms: ['Pick-up only – see website to order'],
  },

  // ---------------- PHOENIX ----------------
  {
    id: 'phx-happys', city: 'phoenix', active: true, confirmed: true,
    name: "Happy's Hamburgers",
    address: '10435 N Scottsdale Rd, Scottsdale, AZ 85253',
    deal: 'FREE DOUBLE CHEESEBURGER',
    short: 'Free double cheeseburger w/ purchase of a side + a drink',
    condition: 'with the purchase of 1 side and a drink',
    terms: ['Dine-in only'],
  },
  {
    id: 'phx-jims', city: 'phoenix', active: true, confirmed: true,
    name: "Jim's Burgers & Eggs",
    address: '17019 W Greenway Rd, Surprise, AZ 85388',
    deal: 'FREE 1/4 LB CHAR BURGER',
    short: 'Free 1/4 lb Char Burger w/ purchase of fries + a drink',
    condition: 'with the purchase of fries and a drink',
    terms: ['Dine-in only'],
  },
  {
    id: 'phx-frashers', city: 'phoenix', active: true, confirmed: true,
    name: "Frasher's Tavern",
    address: '4180 N Drinkwater Blvd, Scottsdale, AZ 85251',
    deal: 'FREE CHEESEBURGER',
    short: 'Free cheeseburger w/ purchase of an appetizer',
    condition: 'with the purchase of an appetizer (fries included)',
    terms: ['Dine-in only', 'Limit 1 per group'],
  },
  {
    id: 'phx-culinary-gangster', city: 'phoenix', active: true, confirmed: true,
    name: 'Culinary Gangster',
    address: '14891 N Northsight Blvd, Ste 135, Scottsdale, AZ 85260',
    deal: 'FREE CHEESEBURGER',
    short: 'Free cheeseburger w/ purchase of fries + drink, or a starter',
    condition: 'with the purchase of fries & a drink, or a starter',
    terms: ['Dine-in only', 'Scottsdale location only'],
  },
  {
    id: 'phx-blu', city: 'phoenix', active: true, confirmed: true,
    name: 'Blu Burger Grille',
    address: '32409 N Scottsdale Rd, Scottsdale, AZ 85266',
    deal: 'BUY ONE BURGER, GET ONE FREE',
    short: 'BOGO burger w/ purchase of 2 drinks (11am–5pm)',
    condition: 'second burger of equal or lesser value, with the purchase of 2 beverages',
    terms: ['Dine-in only', '11am–5pm', 'Excludes happy hour'],
  },
  {
    id: 'phx-roadrunner', city: 'phoenix', active: true, confirmed: true,
    name: 'Roadrunner Restaurant & Saloon',
    address: '47801 N Black Canyon Hwy, New River, AZ 85087',
    deal: '$15 CHEESEBURGER + DOMESTIC BEER',
    short: '$15 classic cheeseburger + domestic beer (M–F 2–5pm)',
    condition: 'a classic cheeseburger and a domestic bottle of beer for $15',
    terms: ['Dine-in only', 'Monday–Friday, 2–5pm'],
  },
  {
    id: 'phx-stumblinas', city: 'phoenix', active: true, confirmed: true,
    name: "Stumblina's Cantina",
    address: '6268 E Cave Creek Rd, Cave Creek, AZ 85331',
    deal: 'BUY ONE BURGER, GET ONE FREE',
    short: 'BOGO burger',
    condition: 'second burger of equal or lesser value',
    terms: ['Dine-in only', 'Limit 1 BiteBook redemption per group'],
  },
  {
    id: 'phx-copper-bull', city: 'phoenix', active: true, confirmed: true,
    name: 'Copper Bull',
    address: '30855 N Cave Creek Rd, Ste 138, Cave Creek, AZ 85331',
    deal: 'FREE ALL AMERICAN BURGER',
    short: 'Free All American Burger w/ purchase of any food item',
    condition: 'with the purchase of any food item',
    terms: ['Dine-in only'],
  },
  {
    id: 'phx-coyote-den', city: 'phoenix', active: true, confirmed: true,
    name: 'Coyote Den Saloon',
    address: '958A E Rodeo Rd, Casa Grande, AZ 85122',
    deal: 'PICK 1 OF 3 BURGER DEALS',
    short: 'Pick 1 of 3 burger deals w/ purchase of a side + drink',
    condition: 'each with a side and a beverage: a free Classic Den Burger, OR buy 1 burger get 1 of equal/lesser value free, OR half off a burger',
    terms: ['Dine-in only', 'Choose one deal per coupon'],
  },
  {
    id: 'phx-patties', city: 'phoenix', active: true, confirmed: true,
    name: 'Patties Pints & Pizzas',
    address: '46202 N Black Canyon Hwy, New River, AZ 85087',
    deal: 'BUY ONE SMASH BURGER, GET ONE FREE',
    short: 'BOGO Smash Burger',
    condition: 'buy 1 Smash Burger, get 1 Smash Burger free',
    terms: ['Dine-in only'],
  },
  {
    id: 'phx-detroit-coney', city: 'phoenix', active: true, confirmed: true,
    name: 'Detroit Coney Grill',
    address: '1422 W Warner Rd, Ste A100, Gilbert, AZ 85233',
    deal: 'BUY ONE SUN DEVIL BURGER, GET ONE FREE',
    short: 'BOGO Sun Devil Burger',
    condition: 'buy 1 Sun Devil Burger, get 1 Sun Devil Burger free',
    terms: ['Dine-in only'],
  },
  {
    // Dropped out Oct 14 (pending again)
    id: 'phx-whiskey-wings', city: 'phoenix', active: false, confirmed: false,
    name: 'Whiskey and Wings',
    address: '34406 N Black Mountain Pkwy, Cave Creek, AZ 85331',
    deal: 'BUY ONE BURGER, GET ONE FREE',
    short: 'BOGO burger',
    condition: 'second burger of equal or lesser value',
    terms: ['Dine-in only'],
  },

  // ---------------- WING MONTH (event: 'wings') ----------------
  // Add Wing Month restaurants here once they're confirmed and their coupon is approved, e.g.:
  // { id: 'wings-nash-example', event: 'wings', city: 'nashville', active: true, confirmed: true,
  //   name: 'Example Wings', address: '...', deal: '6 FREE WINGS', short: '6 free wings w/ purchase of 6 more',
  //   condition: 'with the purchase of 6 more wings', terms: ['Dine-in only'] },
  // Added Nov 19, 2026 from the BiteBook Backend sheet (Restaurants tab): every Wing Month row with
  // Status = Confirmed and Offer = Y. Deal wording is the restaurant's own, tidied into a headline + fine print.
  // Addresses keep what the restaurant gave us; missing city/state/zip was added after checking public listings.
  // Optional `logo: '/logos/<file>'` shows the restaurant's logo on the spinner result card.

  // Denver
  { id: 'wings-den-kickin-chicken', event: 'wings', city: 'denver', active: true, confirmed: true,
    name: 'Kickin Chicken', address: '13650 E Colfax Ave A2, Aurora, CO 80011',
    deal: 'BUY 10 WINGS, GET 5 FREE', short: 'Buy 10 wings, get 5 free',
    condition: 'when you buy 10 wings', terms: [] },
  { id: 'wings-den-wing-spot', event: 'wings', city: 'denver', active: true, confirmed: true,
    name: 'The Wing Spot', address: '800 S. Monaco Street Parkway, Denver, CO 80224',
    deal: '$1 WINGS', short: '$1 wings, no limit',
    condition: 'all day, every day, no limit on wings', terms: ['1 sauce per 5 wings'] },
  { id: 'wings-den-ingas', event: 'wings', city: 'denver', active: true, confirmed: true,
    name: "Inga's Alpine Tavern", address: '5151 Leetsdale Dr, Denver, CO 80246',
    deal: 'BUY 8 WINGS, GET 8 FREE', short: 'Buy 8 wings, get 8 free',
    condition: 'when you buy 8 wings', terms: ['Dine-in only'] },
  { id: 'wings-den-barn-sobo', event: 'wings', city: 'denver', active: true, confirmed: true,
    name: 'The Barn South Broadway', address: '3299 S Broadway, Englewood, CO 80113',
    deal: '1 LB OF WINGS + A HOWDY LAGER FOR $10', short: '1 lb of wings + a Howdy Lager for $10',
    condition: 'a pound of wings and a Howdy Lager for $10', terms: [] },
  { id: 'wings-den-joe-willys', event: 'wings', city: 'denver', active: true, confirmed: true,
    name: "Joe Willy's on Broadway", address: '1310 South Broadway, Denver, CO 80210',
    deal: 'UP TO $5 OFF WINGS', short: '$2.50 off 6 wings, $3.50 off 12, $5 off 24',
    condition: '$2.50 off 6 wings, $3.50 off 12 wings, or $5.00 off 24 wings', terms: [] },
  { id: 'wings-den-wing-cave', event: 'wings', city: 'denver', active: true, confirmed: true,
    name: 'The Wing Cave', address: '1450 W 104th Ave, Northglenn, CO 80234',
    deal: 'BUY 6 WINGS, GET 6 FREE', short: 'Buy 6 wings, get 6 free',
    condition: 'when you buy 6 wings; multiple flavors allowed', terms: ['Dine-in only', 'Limit 1 per customer'] },
  { id: 'wings-den-krave-it', event: 'wings', city: 'denver', active: true, confirmed: true,
    name: 'Krave It', address: '2210 Blake Street, Denver, CO 80205',
    deal: '1 LB OF WINGS FOR $10', short: '1 lb of wings, any flavor, for $10',
    condition: 'any flavor', terms: [] },
  { id: 'wings-den-buffalo-bills', event: 'wings', city: 'denver', active: true, confirmed: true,
    name: "Buffalo Bill's Wings & Things", address: '2014 South University Boulevard, Denver, CO 80210',
    deal: 'BUY 6 WINGS, GET 6 FREE', short: 'Buy 6 wings, get 6 free',
    condition: 'when you buy 6 wings', terms: ['Dine-in only', 'Limit 1 per group'] },
  { id: 'wings-den-coloradough', event: 'wings', city: 'denver', active: true, confirmed: true,
    name: 'Coloradough Pizza', address: '15430 E Smoky Hill Rd, Aurora, CO 80015',
    deal: '$5 OFF A $20+ WING ORDER', short: '$5 off any wing order of $20 or more',
    condition: 'on any wing order of $20 or more', terms: ['Mon–Thu, 3–6 pm only', 'Limit 1 per group'] },
  { id: 'wings-den-swankys', event: 'wings', city: 'denver', active: true, confirmed: true,
    name: "Swanky's Vittles and Libations", address: '1938 Blake St, Denver, CO 80202',
    deal: 'BUY 6 WINGS, GET 6 FREE', short: 'Buy 6 wings, get 6 free (bone-in or boneless)',
    condition: 'with a beverage purchase; also offered on a 9-piece; bone-in or boneless',
    terms: ['Dine-in only', 'Limit 1 per group', 'Premium flavors & sauces extra', 'All flats extra'] },
  { id: 'wings-den-romes-saloon', event: 'wings', city: 'denver', active: true, confirmed: true,
    name: "Rome's Saloon", address: '785 W Mississippi Ave, Denver, CO 80223',
    deal: 'FREE LARGE FRIES WITH 12 WINGS', short: 'Free large fries with a 12-wing entree',
    condition: 'with the purchase of a 12-wing entree', terms: ['Dine-in only', 'Limit 1 per group'] },

  // Nashville
  { id: 'wings-nash-broadway-brewhouse', event: 'wings', city: 'nashville', active: true, confirmed: true,
    name: 'Broadway Brewhouse Downtown', address: '317 Broadway, Nashville, TN 37201',
    deal: 'BUY 6 WINGS, GET 6 FREE', short: 'Buy 6 wings, get 6 free',
    condition: 'when you buy 6 wings', terms: ['Dine-in only', 'Limit 1 per group'] },
  { id: 'wings-nash-baqbone', event: 'wings', city: 'nashville', active: true, confirmed: true,
    name: 'Baqbone BBQ', address: '101 Van Buren St, Nashville, TN 37208 (at Bearded Iris Brewing)',
    deal: '$5 OFF 12 WINGS', short: '$5 off a 12-count of wings',
    condition: 'on a 12-count order of wings', terms: [] },
  // Off until confirmed: no public listing found to verify 908 Woodland St's city/zip.
  { id: 'wings-nash-lost-in-da-sauce', event: 'wings', city: 'nashville', active: false, confirmed: true,
    name: 'Lost in da Sauce', address: '908 Woodland St, Nashville, TN 37206',
    deal: 'BUY 6 WINGS, GET 6 FREE', short: 'Buy 6 wings, get 6 free',
    condition: 'when you buy 6 wings', terms: [] },
  { id: 'wings-nash-lounge-2nd', event: 'wings', city: 'nashville', active: true, confirmed: true,
    name: 'The Lounge @2nd', address: '139 2nd Ave N, Nashville, TN 37201',
    deal: '$1 WINGS', short: '$1 wings (up to 15)',
    condition: 'up to 15 wings', terms: ['1 sauce per order', 'Dine-in only'] },
  { id: 'wings-nash-drifters', event: 'wings', city: 'nashville', active: true, confirmed: true,
    name: 'Drifters BBQ', address: '1008-B Woodland St, Nashville, TN 37206',
    deal: '3 FREE SMOKED WINGS', short: '3 free smoked wings with any entree',
    condition: 'with the purchase of one entree', terms: [] },
  { id: 'wings-nash-fairvue', event: 'wings', city: 'nashville', active: true, confirmed: true,
    name: 'Fairvue Pizza and Pub', address: '1483 Nashville Pike, Gallatin, TN 37066',
    deal: '10 WINGS + A DRINK FOR $10', short: '10 wings and a drink or beer for $10',
    condition: '10 wings and a drink or beer for $10', terms: [] },
  // Off until confirmed: no street number on the form or in any public listing.
  { id: 'wings-nash-pink-house', event: 'wings', city: 'nashville', active: false, confirmed: true,
    name: 'Pink House Madison', address: 'East Old Hickory Boulevard, Nashville, TN 37115',
    deal: 'BUY 6 WINGS, GET 6 FREE', short: 'Buy 6 wings, get 6 free',
    condition: 'when you buy 6 wings', terms: ['Dine-in only', 'Limit 1 per group'] },
  { id: 'wings-nash-fozzys-franklin', event: 'wings', city: 'nashville', active: true, confirmed: true,
    name: "Fozzy's Bar & Grill – Franklin", address: '600A Frazier Dr #135, Franklin, TN 37067',
    deal: 'FREE ORDER OF WINGS', short: 'Free order of wings with a beverage',
    condition: 'traditional or boneless, with the purchase of a beverage', terms: ['Dine-in only', 'Limit 1 per group'] },
  { id: 'wings-nash-fozzys-spring-hill', event: 'wings', city: 'nashville', active: true, confirmed: true,
    name: "Fozzy's Bar & Grill – Spring Hill", address: '150 Stephen P Yokich Pkwy Ste B, Spring Hill, TN 37174',
    deal: 'FREE ORDER OF WINGS', short: 'Free order of wings with a beverage',
    condition: 'traditional or boneless, with the purchase of a beverage', terms: ['Dine-in only', 'Limit 1 per group'] },
  { id: 'wings-nash-mccrearys', event: 'wings', city: 'nashville', active: true, confirmed: true,
    name: "McCreary's Irish Pub & Eatery", address: '414 Main St, Franklin, TN 37064',
    deal: '$1 WINGS', short: '$1 wings, no limit',
    condition: 'no limit', terms: [] },

  // Phoenix
  { id: 'wings-phx-sneakybird', event: 'wings', city: 'phoenix', active: true, confirmed: true,
    name: 'Sneaky Bird', address: '15801 N Frank Lloyd Wright Blvd Ste 100, Scottsdale, AZ 85260',
    deal: '2ND ORDER OF WINGS 50% OFF', short: 'Buy 1 order of wings, get the 2nd 50% off',
    condition: 'when you buy one order of wings', terms: [] },
  { id: 'wings-phx-saddle-mountain', event: 'wings', city: 'phoenix', active: true, confirmed: true,
    name: 'Saddle Mountain Brewing Company', address: '15651 W Roosevelt St, Goodyear, AZ 85338',
    deal: '5 WINGS + A PINT FOR $5', short: '5 wings and a pint of beer for $5',
    condition: '5 wings and a pint of beer for $5', terms: [] },
  { id: 'wings-phx-kimmyz-greenway', event: 'wings', city: 'phoenix', active: true, confirmed: true,
    name: 'Kimmyz on Greenway', address: '5930 West Greenway Road, Glendale, AZ 85306',
    deal: '6 FREE WINGS', short: '6 free wings with an entree',
    condition: 'with the purchase of an entree', terms: ['Dine-in only', 'Limit 1 per group'] },
  { id: 'wings-phx-kimmyz-tatum', event: 'wings', city: 'phoenix', active: true, confirmed: true,
    name: 'Kimmyz Tatum Point', address: '4601 E Bell Rd #9338, Phoenix, AZ 85032',
    deal: '6 FREE WINGS', short: '6 free wings with an entree',
    condition: 'with the purchase of an entree', terms: ['Dine-in only', 'Limit 1 per group'] },
  // Q Bar: the address on the form (5443 W Fetlock Trl) doesn't match either Q Bar & Grill listing
  // (6750 W Olive Ave, Peoria; 20818 N 19th Ave, Phoenix). Off until we confirm which location honors the deal.
  { id: 'wings-phx-q-bar', event: 'wings', city: 'phoenix', active: false, confirmed: true,
    name: 'Q Bar & Grill', address: '',
    deal: '$1 WINGS', short: '$1 wings, 10 am–10 pm daily',
    condition: 'every day from 10 am to 10 pm', terms: [] },
  { id: 'wings-phx-tipsy-taps', event: 'wings', city: 'phoenix', active: true, confirmed: true,
    name: 'The Tipsy Taps and Grill', address: '7192 South Price Road, Tempe, AZ 85283',
    deal: '$3 OFF WINGS', short: '$3 off wings',
    condition: 'on an order of wings', terms: [] },
  { id: 'wings-phx-mrs-chicken', event: 'wings', city: 'phoenix', active: true, confirmed: true,
    name: 'Mrs. Chicken and Mr. Custard', address: '4011 North 32nd Street, Phoenix, AZ 85018',
    deal: 'BUY 6 WINGS, GET 6 FREE', short: 'Buy 6 wings, get 6 free',
    condition: 'when you buy 6 wings', terms: ['Limit 1 per person'] },
  { id: 'wings-phx-stumblinas', event: 'wings', city: 'phoenix', active: true, confirmed: true,
    name: "Stumblina's Cantina", address: '6268 East Cave Creek Road, Cave Creek, AZ 85331',
    deal: 'BUY 1 ORDER OF WINGS, GET 1 FREE', short: 'Buy 1 order of wings, get 1 free',
    condition: 'when you buy one order of wings', terms: ['Dine-in only', 'Limit 1 per group'] },
  { id: 'wings-phx-rack', event: 'wings', city: 'phoenix', active: true, confirmed: true,
    name: 'Rack Scottsdale', address: '3636 N Scottsdale Rd, Scottsdale, AZ 85251',
    deal: '$5 OFF ANY WING ORDER', short: '$5 off any wing order (Mondays: half off wings 4 pm–1 am)',
    condition: 'on any wing order; on Mondays it is half off any wing order from 4 pm to 1 am instead',
    terms: ['Dine-in only'] },
];

export const RESTAURANTS = LINEUP.map((r) => ({ event: 'burger', ...r }));

// Rules printed on every coupon, after the restaurant's own terms
export const UNIVERSAL_TERMS = [
  'One-time use; void once redeemed',
  'Add-ons, toppings & upgrades are extra; tax applies',
  'Not valid with other offers',
  'Please tip on the full value',
];

// ---------------- Live lineups from the backend sheet ----------------
// For every event except Burger Blastoff, the wheel and the coupons come from the BiteBook Backend sheet
// (Restaurants tab), read through lib/sheet.js. A restaurant is in the lineup when its row has:
//   Offer = Y, Status = Confirmed, Event containing the event's name, a ShortDeal and an address.
// Coupon wording: headline = ShortDeal, fine print = CouponFinePrint, terms = CouponTerms (split on ";").
// Address = Google's full address when the map check matched (lib/pins.js), else the sheet's.
// Restaurants that were in the hand-kept list above keep their old id, so coupons people already have
// stay linked; everyone else gets "<event>-<RestaurantCode>". If the sheet can't be read, the hand-kept list is used.
// Call `await loadLineups()` at the start of any request that uses restaurantsFor / restaurantById.
const SHEET_IDS = {
  // RestaurantCode in the sheet -> id the restaurant already had (coupons, spins and passports point at it)
  b0b3ee02: 'wings-den-kickin-chicken', '606ca7cd': 'wings-den-wing-spot', '3077a973': 'wings-den-ingas',
  c8fe4e36: 'wings-den-barn-sobo', ac7263f4: 'wings-den-joe-willys', '418d3e5f': 'wings-den-wing-cave',
  '45eda82c': 'wings-den-krave-it', bec2cce3: 'wings-den-buffalo-bills', '812a60f8': 'wings-den-coloradough',
  '09b7b326': 'wings-den-swankys', f65291cd: 'wings-den-romes-saloon',
  '69941b42': 'wings-nash-broadway-brewhouse', e56033f1: 'wings-nash-baqbone', e5017289: 'wings-nash-lost-in-da-sauce',
  f4e34b5d: 'wings-nash-lounge-2nd', '1f23de1b': 'wings-nash-drifters', e7bef3c3: 'wings-nash-fairvue',
  '20e25a7d': 'wings-nash-pink-house', e31f7ca8: 'wings-nash-fozzys-franklin', '5d72ac3e': 'wings-nash-fozzys-spring-hill',
  f5d015f6: 'wings-nash-mccrearys', df1e9b7e: 'wings-nash-mccrearys',
  ca7a38de: 'wings-phx-sneakybird', d3284221: 'wings-phx-saddle-mountain', c316f49a: 'wings-phx-kimmyz-greenway',
  '608dd680': 'wings-phx-kimmyz-tatum', a62d2908: 'wings-phx-q-bar', '68c84539': 'wings-phx-tipsy-taps',
  f09923e0: 'wings-phx-mrs-chicken', '988a88ce': 'wings-phx-stumblinas', a0ef57ca: 'wings-phx-rack',
};
const HAND_BY_ID = new Map(RESTAURANTS.map((r) => [r.id, r]));
const slugify = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
let LIVE = null; // restaurants from the sheet (all events except burger), or null = use the hand-kept list

export function buildLineup(rows, events, { addressFor = (loc) => loc.address } = {}) {
  const out = new Map();
  for (const ev of events) {
    for (const r of rows || []) {
      if (String(r.Offer || '').trim().toLowerCase() !== 'y') continue;
      if (String(r.Status || '').trim().toLowerCase() !== 'confirmed') continue;
      if (!String(r.Event || '').toLowerCase().includes(ev.name.toLowerCase())) continue;
      const cityId = String(r.City || '').trim().toLowerCase();
      if (!ev.cities.includes(cityId)) continue;
      const short = String(r.ShortDeal || '').trim();
      const sheetName = String(r.RestaurantName || '').trim();
      const loc = { sheetName, city: String(r.City || '').trim(), address: String(r.Address || '').trim(), placeId: String(r.GooglePlaceId || '').trim() };
      const address = addressFor(loc);
      if (!short || !address || !sheetName) continue; // no deal or no address yet: stays off the wheel
      const code = String(r.RestaurantCode || '').trim();
      const id = (ev.id === 'wings' && SHEET_IDS[code]) || `${ev.id}-${code || slugify(`${cityId}-${sheetName}`)}`;
      if (out.has(id)) continue; // duplicate row (repeat form submission)
      const old = HAND_BY_ID.get(id);
      out.set(id, {
        id, event: ev.id, city: cityId, active: true, confirmed: true, code,
        name: String(r.WebsiteName || '').trim() || sheetName,
        address,
        deal: short.toUpperCase(),
        short,
        condition: String(r.CouponFinePrint || '').trim(),
        terms: String(r.CouponTerms || '').split(';').map((t) => t.trim()).filter(Boolean),
        ...((String(r.Logo || '').trim() || old?.logo) ? { logo: String(r.Logo || '').trim() || old.logo } : {}),
      });
    }
  }
  return [...out.values()];
}

export async function loadLineups() {
  try {
    const [{ sheetRows }, pins, { EVENTS }] = await Promise.all([import('./sheet.js'), import('./pins.js'), import('./config.js')]);
    const [rows] = await Promise.all([sheetRows(), pins.savedPins()]);
    if (!rows) return; // feed not set up or unreachable with nothing saved: keep the hand-kept list
    // The feed must already pass the coupon columns; until then keep the hand-kept wording
    if (rows.length && !('CouponTerms' in rows[0])) return;
    const events = Object.values(EVENTS).filter((e) => e.id !== 'burger' && e.cities?.length);
    LIVE = buildLineup(rows, events, { addressFor: pins.couponAddress });
  } catch (e) {
    console.error('loadLineups:', e.message || e);
  }
}

export function restaurantsFor(cityId, eventId = 'burger') {
  if (LIVE && eventId !== 'burger') return LIVE.filter((r) => r.city === cityId && r.event === eventId);
  return RESTAURANTS.filter((r) => r.city === cityId && r.event === eventId && r.active);
}

// Live first; the hand-kept list still answers for old ids, so every coupon ever issued keeps working
export function restaurantById(id) {
  return (LIVE && LIVE.find((r) => r.id === id)) || HAND_BY_ID.get(id) || null;
}
