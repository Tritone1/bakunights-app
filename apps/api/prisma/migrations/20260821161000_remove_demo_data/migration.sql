-- Remove only records carrying the exact synthetic signatures used by the former demo seeds.
-- Real users and merchant-created venues are deliberately outside these predicates.
DELETE FROM "restaurants"
WHERE "phone" LIKE '(512) 555-%'
  AND "name" IN (
    'Sunbird Diner', 'Luna Roja', 'Curry Up', 'The Noodle Club', 'Olive & Thyme', 'Hot Bird',
    'Pho Real', 'Greenhouse', 'Nonna''s Table', 'Seoul Bowl', 'Smoke Stack', 'Baker Street',
    'Coastal Catch', 'Za-Zoom', 'Golden Hour', 'Falafel Radio', 'Bangkok Local', 'Little Havana'
  );

DELETE FROM "restaurants"
WHERE "phone" LIKE '+994 50 555 %'
  AND "name" IN (
    'Chinar Restaurant', 'Sky Bar Baku', 'Old City Pub', 'Flame Lounge', 'Caspian Bistro', 'Nargiz Cocktail Bar',
    'Dolma House', 'Sahil Kitchen', 'Fountain Square Grill', 'Nizami Sushi', 'Qala Taproom', 'White City Cafe',
    'Port Baku Trattoria', 'Nar & Saffron', 'Bulvar Burger', 'Shah Plov', 'Mangal Steakhouse', 'Crescent Mocktail Club'
  );

DELETE FROM "users"
WHERE "email" IN (
  'admin@bakunights.test',
  'ops@bakunights.test',
  'merchant@grubstub.test',
  'demo@grubstub.test'
);
