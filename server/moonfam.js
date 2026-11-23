// Moon Fam: guest-list tickets for facilitators, artists and mooncrew.
// The page is unlisted (not linked from the site or sitemap); anyone with its URL can book.
// Prices live here (not in PRICING) so they are not exposed through /api/public/pricing.
const express = require('express');
const crypto = require('crypto');

const router = express.Router();

const PASS_ROOMS = {
  1: { roomType: 'Moon Fam 1 Day Pass', price: 3000, days: 1 },
  2: { roomType: 'Moon Fam 2 Day Pass', price: 6000, days: 2 },
  3: { roomType: 'Moon Fam 3 Day Pass', price: 9000, days: 3 },
};
const CART_ROOM = 'Moon Fam Cart';
const WORKSHOP_ROOM = 'Moon Fam Workshops';
const WORKSHOP_PRICE = 650;
const GIG_ROOM = 'Moon Fam Gigs';
// Schedule source of truth: schedule.html (the public schedule page). Copied here so this page
// does not parse HTML at runtime. When schedule.html changes, update WORKSHOP_SLOTS and GIGS below.
const FESTIVAL_DAYS = [
  { date: "2026-11-27", key: "27 Nov", label: "Fri 27 Nov" },
  { date: "2026-11-28", key: "28 Nov", label: "Sat 28 Nov" },
  { date: "2026-11-29", key: "29 Nov", label: "Sun 29 Nov" },
];
// Time slots sold as Moon Fam workshops (one pick per slot). Unity Circle and Moon Choir are single sessions.
const WORKSHOP_SLOTS = [
  {
    "day": "27 Nov",
    "time": "9:00 – 10:00 AM",
    "sessions": [
      {
        "session": "Heart Centered Breathwork",
        "facilitator": "Karishma",
        "venue": "Space"
      },
      {
        "session": "Tai Chi",
        "facilitator": "Hinoki-Dogu",
        "venue": "Asteroid"
      },
      {
        "session": "Kalaripayattu",
        "facilitator": "Tre",
        "venue": "Comet"
      },
      {
        "session": "Hatha Yoga - Asana & Pranayama",
        "facilitator": "Varun",
        "venue": "Stardust"
      },
      {
        "session": "Mat Pilates",
        "facilitator": "Pooja",
        "venue": "Meteor"
      },
      {
        "session": "Aerial Yoga",
        "facilitator": "Sonia",
        "venue": "Nebula"
      }
    ]
  },
  {
    "day": "27 Nov",
    "time": "10:15 – 11:15 AM",
    "sessions": [
      {
        "session": "Bhangra",
        "facilitator": "Folking Desi",
        "venue": "Asteroid"
      },
      {
        "session": "Bellydance Basics",
        "facilitator": "Aakriti",
        "venue": "Comet"
      },
      {
        "session": "Voice Activation",
        "facilitator": "Lauren-Leonie",
        "venue": "Stardust"
      },
      {
        "session": "Sensual Bollywood",
        "facilitator": "Dhanisa",
        "venue": "Meteor"
      },
      {
        "session": "Clownery",
        "facilitator": "Alice",
        "venue": "Sky"
      }
    ]
  },
  {
    "day": "27 Nov",
    "time": "1:00 – 2:30 PM",
    "sessions": [
      {
        "session": "Unity Circle",
        "facilitator": "Chris",
        "venue": "Space"
      }
    ]
  },
  {
    "day": "27 Nov",
    "time": "3:00 – 4:00 PM",
    "sessions": [
      {
        "session": "Sufi Singing",
        "facilitator": "Anushaw",
        "venue": "Space"
      },
      {
        "session": "Bharatnatyam Fusion",
        "facilitator": "Disha",
        "venue": "Asteroid"
      },
      {
        "session": "Kirtan",
        "facilitator": "Ananda Flow",
        "venue": "Comet"
      },
      {
        "session": "Tantric Death Meditation — Viraja Homam",
        "facilitator": "Pradesh Raj",
        "venue": "Stardust"
      },
      {
        "session": "Afro Dance",
        "facilitator": "Sadashiv",
        "venue": "Meteor"
      },
      {
        "session": "Tye & Dye Art",
        "facilitator": "Shreya",
        "venue": "Nebula"
      },
      {
        "session": "Japanese fabric art",
        "facilitator": "Shital",
        "venue": "Sky"
      }
    ]
  },
  {
    "day": "27 Nov",
    "time": "4:15 – 5:15 PM",
    "sessions": [
      {
        "session": "Ayurveda Talk — Why was protein never mentioned in Ayurveda?",
        "facilitator": "Dr Kanchan",
        "venue": "Space"
      },
      {
        "session": "Bachata",
        "facilitator": "Maya",
        "venue": "Asteroid"
      },
      {
        "session": "Contact Improvisation",
        "facilitator": "Kaprila",
        "venue": "Comet"
      },
      {
        "session": "Throat Singing",
        "facilitator": "Martin",
        "venue": "Stardust"
      },
      {
        "session": "Somatic Movement",
        "facilitator": "Sonia",
        "venue": "Meteor"
      },
      {
        "session": "Animal Flow",
        "facilitator": "Vipindas",
        "venue": "Nebula"
      }
    ]
  },
  {
    "day": "28 Nov",
    "time": "8:00 – 9:00 AM",
    "sessions": [
      {
        "session": "Mobility via Kalari",
        "facilitator": "Tre",
        "venue": "Asteroid"
      },
      {
        "session": "Expressions & Hand Gestures",
        "facilitator": "Disha",
        "venue": "Comet"
      },
      {
        "session": "Animal Flow",
        "facilitator": "Vipindas",
        "venue": "Stardust"
      },
      {
        "session": "Mat Pilates",
        "facilitator": "Pooja",
        "venue": "Meteor"
      },
      {
        "session": "Yoga",
        "facilitator": "Pradesh Raj",
        "venue": "Nebula"
      }
    ]
  },
  {
    "day": "28 Nov",
    "time": "9:15 – 10:15 AM",
    "sessions": [
      {
        "session": "Sufi Singing",
        "facilitator": "Anushaw",
        "venue": "Space"
      },
      {
        "session": "Contact Improvisation",
        "facilitator": "Kaprila",
        "venue": "Asteroid"
      },
      {
        "session": "Indo Contemporary",
        "facilitator": "Dhanisa",
        "venue": "Comet"
      },
      {
        "session": "Somatic Movement",
        "facilitator": "Sonia",
        "venue": "Stardust"
      },
      {
        "session": "Aaja Nachle - Bellydance choreography",
        "facilitator": "Aakriti",
        "venue": "Meteor"
      },
      {
        "session": "Cyanotype Tote Bag",
        "facilitator": "Shreya",
        "venue": "Nebula"
      },
      {
        "session": "Shamanic Rose Healing",
        "facilitator": "Karishma",
        "venue": "Sky"
      }
    ]
  },
  {
    "day": "28 Nov",
    "time": "12:15 – 1:15 PM",
    "sessions": [
      {
        "session": "Kirtan",
        "facilitator": "Nad Mandala",
        "venue": "Space"
      },
      {
        "session": "Trippy Yoga Nidra",
        "facilitator": "Varun, Ankit & Marco",
        "venue": "Asteroid"
      }
    ]
  },
  {
    "day": "28 Nov",
    "time": "1:30 – 2:30 PM",
    "sessions": [
      {
        "session": "Bhangra",
        "facilitator": "Folking Desi",
        "venue": "Asteroid"
      },
      {
        "session": "Afro Dance",
        "facilitator": "Sadashiv",
        "venue": "Comet"
      },
      {
        "session": "Bachata",
        "facilitator": "Maya",
        "venue": "Stardust"
      },
      {
        "session": "Forest Mask",
        "facilitator": "Dryad",
        "venue": "Meteor"
      },
      {
        "session": "Ayurveda Talk — Ayurvedic Practices for gut health that actually work!",
        "facilitator": "Dr Kanchan",
        "venue": "Sky"
      }
    ]
  },
  {
    "day": "29 Nov",
    "time": "8:00 – 9:00 AM",
    "sessions": [
      {
        "session": "Animal Flow",
        "facilitator": "Vipindas",
        "venue": "Space"
      },
      {
        "session": "Kalaripayattu",
        "facilitator": "Tre",
        "venue": "Asteroid"
      },
      {
        "session": "Throat Singing",
        "facilitator": "Martin",
        "venue": "Comet"
      },
      {
        "session": "Hatha Yoga - Asana & Pranayama",
        "facilitator": "Varun",
        "venue": "Stardust"
      },
      {
        "session": "Sufi Singing",
        "facilitator": "Anushaw",
        "venue": "Meteor"
      },
      {
        "session": "Aerial Yoga",
        "facilitator": "Sonia",
        "venue": "Nebula"
      }
    ]
  },
  {
    "day": "29 Nov",
    "time": "9:15 – 10:15 AM",
    "sessions": [
      {
        "session": "Soul Kirtan",
        "facilitator": "Gouranga",
        "venue": "Space"
      },
      {
        "session": "Bhangra",
        "facilitator": "Folking Desi",
        "venue": "Asteroid"
      },
      {
        "session": "STRONG CORE (Strength & Conditioning)",
        "facilitator": "Dhanisa",
        "venue": "Comet"
      },
      {
        "session": "Inner waters (somatic movement and flow)",
        "facilitator": "Aakriti",
        "venue": "Stardust"
      },
      {
        "session": "Tai Chi",
        "facilitator": "Hinoki-Dogu",
        "venue": "Meteor"
      },
      {
        "session": "Mat Pilates",
        "facilitator": "Pooja",
        "venue": "Nebula"
      },
      {
        "session": "Tote Bag",
        "facilitator": "Shreya",
        "venue": "Sky"
      }
    ]
  },
  {
    "day": "29 Nov",
    "time": "12:00 – 1:30 PM",
    "sessions": [
      {
        "session": "Moon Choir",
        "facilitator": "Kaprila",
        "venue": "Space"
      }
    ]
  },
  {
    "day": "29 Nov",
    "time": "3:15 – 4:30 PM",
    "sessions": [
      {
        "session": "Moon Olympics — Strengthening the Soul",
        "facilitator": "Chris",
        "venue": "Space"
      },
      {
        "session": "Sensual Bollywood",
        "facilitator": "Dhanisa",
        "venue": "Asteroid"
      },
      {
        "session": "Clownery",
        "facilitator": "Alice",
        "venue": "Comet"
      },
      {
        "session": "Bachata",
        "facilitator": "Maya",
        "venue": "Stardust"
      },
      {
        "session": "Should I Destroy My Ego? Ego to Instrument",
        "facilitator": "Varun",
        "venue": "Sky"
      }
    ]
  }
]
// Evening shows and dances sold as Moon Fam gigs.
const GIGS = [
  {
    "day": "27 Nov",
    "time": "8:15 – 10:00 PM",
    "session": "Luna Viajera — Latin Fusion Band",
    "facilitator": "",
    "venue": "Space"
  },
  {
    "day": "28 Nov",
    "time": "2:45 – 4:15 PM",
    "session": "Ecstatic Dance",
    "facilitator": "Martin",
    "venue": "Space"
  },
  {
    "day": "28 Nov",
    "time": "8:00 – 10:00 PM",
    "session": "The Elevate Show",
    "facilitator": "Chris",
    "venue": "Space"
  },
  {
    "day": "29 Nov",
    "time": "5:00 – 6:30 PM",
    "session": "Ecstatic Dance & Cacao",
    "facilitator": "Annida",
    "venue": "Space"
  },
  {
    "day": "29 Nov",
    "time": "8:00 PM",
    "session": "Moon Musician Jam",
    "facilitator": "",
    "venue": "Space"
  },
  {
    "day": "29 Nov",
    "time": "9:00 PM",
    "session": "Bageecha — Hindi Film Retro",
    "facilitator": "",
    "venue": "Space"
  }
];
// All gigs are 900.
const GIG_PRICE = 900;
const gigPrice = () => GIG_PRICE;

let workshopCache = null;
let gigCache = null;
const slotId = (...parts) => crypto.createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 12);
function fullDay(key) { return FESTIVAL_DAYS.find(d => d.key === key); }
function loadGigs() {
  if (gigCache) return gigCache;
  gigCache = GIGS.map(g => ({
    id: slotId("gig", fullDay(g.day).date, g.time, g.session),
    day: g.day, dayLabel: fullDay(g.day).label, time: g.time, session: g.session,
    facilitator: g.facilitator, price: gigPrice(g.session),
  }));
  return gigCache;
}
function loadWorkshops() {
  if (workshopCache) return workshopCache;
  workshopCache = WORKSHOP_SLOTS.flatMap(slot => slot.sessions.map(s => ({
    id: slotId(fullDay(slot.day).date, slot.time, s.session),
    day: slot.day, dayLabel: fullDay(slot.day).label, time: slot.time,
    session: s.session, facilitator: s.facilitator || "", venue: s.venue || "",
  })));
  return workshopCache;
}

// GET /api/moonfam/data → passes, days, workshops for the Moon Fam page
router.get('/data', (req, res) => {
  res.json({
    passes: Object.entries(PASS_ROOMS).map(([n, p]) => ({ passDays: Number(n), price: p.price })),
    days: FESTIVAL_DAYS.map(d => ({ key: d.key, label: d.label })),
    workshop_price: WORKSHOP_PRICE,
    workshops: loadWorkshops(),
    gigs: loadGigs(),
    gst_rate: 0.05,
  });
});

// Quote for one Moon Fam cart: any mix of a day pass, single workshops and gigs.
// Days covered by a pass cannot also carry workshops or gigs. Throws Error(message) when invalid.
function quoteCart(input, guestCount) {
  const validKeys = FESTIVAL_DAYS.map(d => d.key);
  const passN = Number(input.passDays) || 0;
  let pass = null;
  let passKeys = [];
  if (passN) {
    pass = PASS_ROOMS[passN];
    if (!pass) throw new Error("Please choose a 1, 2 or 3 day pass.");
    const picked = Array.isArray(input.days) ? [...new Set(input.days)] : [];
    if (picked.length !== pass.days || picked.some(d => !validKeys.includes(d))) {
      throw new Error(`Please choose exactly ${pass.days} festival day${pass.days > 1 ? "s" : ""} for this pass.`);
    }
    passKeys = validKeys.filter(k => picked.includes(k));
  }
  const wsIdList = Array.isArray(input.workshopIds) ? [...new Set(input.workshopIds)] : [];
  const gigIdList = Array.isArray(input.gigIds) ? [...new Set(input.gigIds)] : [];
  if (!pass && !wsIdList.length && !gigIdList.length) throw new Error("Please choose a day pass, workshops or gigs.");

  const allW = loadWorkshops();
  const workshops = wsIdList.map(id => allW.find(w => w.id === id));
  if (workshops.some(w => !w)) throw new Error("One of the chosen workshops is no longer in the schedule. Please choose again.");
  const allG = loadGigs();
  const gigs = gigIdList.map(id => allG.find(g => g.id === id));
  if (gigs.some(g => !g)) throw new Error("One of the chosen gigs is no longer in the schedule. Please choose again.");
  if (workshops.some(w => passKeys.includes(w.day)) || gigs.some(g => passKeys.includes(g.day))) {
    throw new Error("Sessions on a pass day are already included in your pass. Please remove them.");
  }

  const perPerson = (pass ? pass.price : 0) + workshops.length * WORKSHOP_PRICE + gigs.reduce((s, g) => s + g.price, 0);
  const kinds = (pass ? 1 : 0) + (workshops.length ? 1 : 0) + (gigs.length ? 1 : 0);
  let roomType;
  if (kinds > 1) roomType = CART_ROOM;
  else if (pass) roomType = pass.roomType;
  else if (workshops.length) roomType = WORKSHOP_ROOM;
  else roomType = GIG_ROOM;

  const parts = [];
  if (pass) parts.push(kinds > 1 ? "Pass: " + passKeys.join(", ") : passKeys.join(", "));
  if (workshops.length) parts.push("Workshops: " + workshops.map(w => `${w.session} (${w.day} ${w.time})`).join("; "));
  if (gigs.length) parts.push("Gigs: " + gigs.map(g => `${g.session} (${g.day} ${g.time})`).join("; "));
  return {
    venue: "Festival Access",
    roomType,
    totalBase: perPerson * guestCount,
    daysSelected: parts.join(" | "),
  };
}

// Older page versions send one mode at a time; map them onto the cart quote.
function quoteMoonFam(input, guestCount) {
  if (input.mode === "pass") return quoteCart({ passDays: input.passDays, days: input.days }, guestCount);
  if (input.mode === "workshops") return quoteCart({ workshopIds: input.workshopIds }, guestCount);
  if (input.mode === "gigs") return quoteCart({ gigIds: input.gigIds }, guestCount);
  return quoteCart(input, guestCount);
}

module.exports = { router, quoteMoonFam, quoteCart, PASS_ROOMS, WORKSHOP_ROOM, FESTIVAL_DAYS };
