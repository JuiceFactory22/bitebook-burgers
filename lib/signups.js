// Every restaurant that has signed up for Wing Month, confirmed or not, for the public lineup on
// getbitebook.com/wings/<city>. Built from the BiteBook Backend sheet (Restaurants tab).
// Last updated: Nov 22, 2026.
//
// To add a restaurant: copy a line and change city (denver, nashville or phoenix), name, area and deal.
//   deal: null  -> shows "Deal coming soon" (use while the deal is still being worked out)
//   lat / lng   -> optional map pin (leave them off and the restaurant still shows in the list)
// This list is only for the website. Passports and coupons still come from lib/restaurants.js.
// Public page: no contact details or anything private here, ever.

export const SIGNUPS = [
  {"city": "denver", "name": "Two Lazy Dogs Bar and Grill", "area": "Downtown Denver", "deal": "$2 off a pound of house-smoked wings", "lat": 39.74593, "lng": -104.99481},
  {"city": "denver", "name": "Kickin Chicken", "area": "Aurora", "deal": "Buy 10 wings, get 5 free", "lat": 39.74009, "lng": -104.8298},
  {"city": "denver", "name": "The Wing Spot", "area": "Denver", "deal": "$1 wings all day, no limit", "lat": 39.70199, "lng": -104.91268},
  {"city": "denver", "name": "Inga's Alpine Tavern", "area": "Denver", "deal": "Buy 8 wings, get 8 free", "lat": 39.70871, "lng": -104.92986},
  {"city": "denver", "name": "The Barn South Broadway", "area": "Englewood", "deal": "1 lb of wings + a Howdy Lager for $10", "lat": 39.65644, "lng": -104.98766},
  {"city": "denver", "name": "Wild Corgi Pub", "area": "Capitol Hill", "deal": null, "lat": 39.73693, "lng": -104.9727},
  {"city": "denver", "name": "Peckish Pizza and Wings", "area": "Centennial", "deal": "$1 wings (up to 18) with the purchase of any beverage", "lat": 39.62512, "lng": -104.90688},
  {"city": "denver", "name": "Pub on Penn", "area": "Capitol Hill", "deal": null, "lat": 39.7365, "lng": -104.98099},
  {"city": "denver", "name": "Welton Street Cafe", "area": "Five Points", "deal": null, "lat": 39.75653, "lng": -104.97593},
  {"city": "denver", "name": "AFC Wings", "area": "Food truck", "deal": null},
  {"city": "denver", "name": "Joe Willy's on Broadway", "area": "Denver", "deal": "$2.50 off 6 wings, $3.50 off 12, $5 off 24", "lat": 39.69278, "lng": -104.98739},
  {"city": "denver", "name": "Rocky Mountain Wraps", "area": "Conifer", "deal": "Free large fries with the purchase of 12 wings", "lat": 39.54202, "lng": -105.29636},
  {"city": "denver", "name": "The Wing Cave", "area": "Northglenn", "deal": "Buy 6 wings, get 6 free", "lat": 39.885, "lng": -105.00422},
  {"city": "denver", "name": "Brad's Pit BBQ", "area": "Littleton", "deal": null, "lat": 39.60887, "lng": -105.03774},
  {"city": "denver", "name": "Krave It", "area": "LoDo", "deal": "1 lb of wings, any flavor, for $10", "lat": 39.75625, "lng": -104.99169},
  {"city": "denver", "name": "The Frontier Club", "area": "Aurora", "deal": null, "lat": 39.74031, "lng": -104.76628},
  {"city": "denver", "name": "Buffalo Bill's Wings & Things", "area": "Denver", "deal": "Buy 6 wings, get 6 free", "lat": 39.67995, "lng": -104.95931},
  {"city": "denver", "name": "Mama Jo's Chicken, Biscuits, BBQ", "area": "East Colfax", "deal": "6 wings + a draft beer for $13 (Wednesdays)", "lat": 39.7402, "lng": -104.94609},
  {"city": "denver", "name": "Coloradough Pizza", "area": "Aurora", "deal": "$5 off any wing order of $20 or more", "lat": 39.63208, "lng": -104.80897},
  {"city": "denver", "name": "Tavern Brooks Place", "area": "Denver", "deal": "$2 off wings"},
  {"city": "denver", "name": "Swanky's Vittles and Libations", "area": "LoDo", "deal": "Buy 6 wings, get 6 free", "lat": 39.7537, "lng": -104.99497},
  {"city": "denver", "name": "Rome's Saloon", "area": "Denver", "deal": "Free large fries with the purchase of a 12-wing entree", "lat": 39.69674, "lng": -104.99657},
  {"city": "denver", "name": "Beau Jo's", "area": "Denver", "deal": null, "lat": 39.6782, "lng": -104.95932},
  {"city": "denver", "name": "Blazing Bird Nashville Hot Chicken", "area": "Aurora", "deal": "20% off any wings", "lat": 39.7401, "lng": -104.82819},
  {"city": "nashville", "name": "Broadway Brewhouse Downtown", "area": "Downtown", "deal": "Buy 6 wings, get 6 free", "lat": 36.1612, "lng": -86.77661},
  {"city": "nashville", "name": "Baqbone BBQ", "area": "Germantown", "deal": "$5 off a 12-count of wings", "lat": 36.18149, "lng": -86.78609},
  {"city": "nashville", "name": "Corner Bar South", "area": "Nolensville Pike", "deal": null, "lat": 36.12696, "lng": -86.75311},
  {"city": "nashville", "name": "Golden Indian Cuisine and Pizza", "area": "Hendersonville", "deal": null, "lat": 36.3047, "lng": -86.62057},
  {"city": "nashville", "name": "McCreary's Irish Pub & Eatery", "area": "Franklin", "deal": "$1 wings, no limit", "lat": 35.9245, "lng": -86.87055},
  {"city": "nashville", "name": "Lost in da Sauce", "area": "East Nashville", "deal": "Buy 6 wings, get 6 free", "lat": 36.17513, "lng": -86.75599},
  {"city": "nashville", "name": "The Lounge @2nd", "area": "Downtown", "deal": "$1 wings (up to 15)", "lat": 36.1625, "lng": -86.77565},
  {"city": "nashville", "name": "Drifters BBQ", "area": "East Nashville", "deal": "3 free smoked wings with the purchase of any entree", "lat": 36.17718, "lng": -86.75064},
  {"city": "nashville", "name": "Fairvue Pizza and Pub", "area": "Gallatin", "deal": "10 wings + a drink or beer for $10", "lat": 36.36077, "lng": -86.4972},
  {"city": "nashville", "name": "Pink House Madison", "area": "Madison", "deal": "Buy 6 wings, get 6 free"},
  {"city": "nashville", "name": "Fozzy's Bar & Grill – Franklin", "area": "Franklin", "deal": "Free order of wings with the purchase of a beverage", "lat": 35.9446, "lng": -86.82083},
  {"city": "nashville", "name": "Fozzy's Bar & Grill – Spring Hill", "area": "Spring Hill", "deal": "Free order of wings with the purchase of a beverage", "lat": 35.74587, "lng": -86.93953},
  {"city": "nashville", "name": "Tha Caddy Shack", "area": "Briley Pkwy", "deal": null, "lat": 36.13704, "lng": -86.69966},
  {"city": "nashville", "name": "Rack N Tap", "area": "Nashville", "deal": "$1 wings"},
  {"city": "nashville", "name": "Italian Pizza House", "area": "Nashville", "deal": "$1 wings on select days"},
  {"city": "nashville", "name": "Edessa Burger & Pizza", "area": "Nolensville Pike", "deal": "Free fries + a drink with the purchase of an order of wings", "lat": 36.11538, "lng": -86.7476},
  {"city": "phoenix", "name": "Argento's Pizza & Wings", "area": "Buckeye", "deal": null, "lat": 33.37044, "lng": -112.57979},
  {"city": "phoenix", "name": "Bonfire Craft Kitchen & Tap House", "area": "Tempe", "deal": null, "lat": 33.33445, "lng": -111.96616},
  {"city": "phoenix", "name": "Zzeek's Pizza & Wings", "area": "Phoenix", "deal": null, "lat": 33.33112, "lng": -111.97944},
  {"city": "phoenix", "name": "Sneaky Bird", "area": "Scottsdale", "deal": "Buy 1 order of wings, get the 2nd 50% off", "lat": 33.62839, "lng": -111.88135},
  {"city": "phoenix", "name": "Carolina Fried Chicken", "area": "Phoenix", "deal": "$1 wings", "lat": 33.48036, "lng": -112.03158},
  {"city": "phoenix", "name": "Saddle Mountain Brewing Company", "area": "Goodyear", "deal": "5 wings + a pint of beer for $5", "lat": 33.45724, "lng": -112.39682},
  {"city": "phoenix", "name": "TimeCapsule Bar and Grill", "area": "Phoenix", "deal": "$1 wings", "lat": 33.55315, "lng": -112.13619},
  {"city": "phoenix", "name": "Kimmyz on Greenway", "area": "Glendale", "deal": "6 free wings with the purchase of an entree", "lat": 33.62524, "lng": -112.18623},
  {"city": "phoenix", "name": "Kimmyz Tatum Point", "area": "North Phoenix", "deal": "6 free wings with the purchase of an entree", "lat": 33.64055, "lng": -111.98197},
  {"city": "phoenix", "name": "Q Bar & Grill", "area": "Phoenix", "deal": "$1 wings, 10 am–10 pm daily", "lat": 33.7316, "lng": -112.18721},
  {"city": "phoenix", "name": "The Tipsy Taps and Grill", "area": "Tempe", "deal": "$3 off wings", "lat": 33.36148, "lng": -111.89473},
  {"city": "phoenix", "name": "Mrs. Chicken and Mr. Custard", "area": "Phoenix", "deal": "Buy 6 wings, get 6 free", "lat": 33.49441, "lng": -112.01291},
  {"city": "phoenix", "name": "Stumblina's Cantina", "area": "Cave Creek", "deal": "Buy 1 order of wings, get 1 free", "lat": 33.83217, "lng": -111.94505},
  {"city": "phoenix", "name": "Rack Scottsdale", "area": "Scottsdale", "deal": "$5 off any wing order (Mondays: half off)", "lat": 33.49047, "lng": -111.92618},
  {"city": "phoenix", "name": "Vicio", "area": "Phoenix", "deal": "Free garlic bread with the purchase of an order of wings"},
  {"city": "phoenix", "name": "Pizza Mart", "area": "Mesa", "deal": "$10 wing orders (10 bone-in or 12 boneless)", "lat": 33.41515, "lng": -111.80345},
  {"city": "phoenix", "name": "Wok 'N Roll", "area": "Scottsdale", "deal": null, "lat": 33.49994, "lng": -111.91754},
  {"city": "phoenix", "name": "The Hudson Eatery & Bar", "area": "Tempe", "deal": "Buy 10 wings, get 10 free", "lat": 33.41471, "lng": -111.91225},
  {"city": "phoenix", "name": "Vito's Pizza & Italian Ristorante", "area": "Mesa", "deal": "Buy 10 wings, get 10 free", "lat": 33.45096, "lng": -111.7707},
  {"city": "phoenix", "name": "Tom's Watch Bar", "area": "Downtown Phoenix", "deal": "Wings + two cocktails for $25 (Mon–Fri)", "lat": 33.44819, "lng": -112.07121},
  {"city": "phoenix", "name": "414 Pub Pizza & Karaoke", "area": "Mesa", "deal": "50% off any wing order (Wednesday nights)", "lat": 33.3933, "lng": -111.84682},
  {"city": "phoenix", "name": "Blu Burger Grille", "area": "North Scottsdale", "deal": "Half off wings with the purchase of an entree", "lat": 33.77885, "lng": -111.92576},
];

export function signupsFor(cityId) {
  return SIGNUPS.filter((r) => r.city === cityId);
}
