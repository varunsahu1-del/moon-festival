require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { sendConfirmation } = require('./email');

const booking = {
  booking_ref:    'MF-TEST',
  venue:          'Bhakti Kutir',
  room_type:      'Double Sharing',
  total_price:    '40250',
  guest_count:    2,
  payment_method:   'upi',
  status:           'upi_pending',
  upi_screenshot:   'test-upi-screenshot.jpg',
  room_number:    '7',
  arrival_date:   '26 Nov',
  addons:         '2750:Extra Day (26 Nov)|3200:Tribal Lunch (28 Nov)|2500:Ayurvedic Massage',
};

const guests = [
  { full_name: 'Varun Sahu',  email: 'moonyogaadventures@gmail.com', whatsapp: '+91 98207 91100', city: 'Mumbai',    age: 30, gender: 'Male', address: '12 Marine Lines', state: 'Maharashtra', pin: '400020' },
  { full_name: 'Karan Mehta', email: 'moonyogaadventures@gmail.com', whatsapp: '+91 99309 20313', city: 'Bangalore', age: 28, gender: 'Male', address: '5 MG Road',       state: 'Karnataka',   pin: '560001' },
];

sendConfirmation({ booking, guests })
  .then(() => { console.log('✓ Test confirmation email sent to moonyogaadventures@gmail.com'); })
  .catch(e  => { console.error('✗ Failed:', e.message); });
