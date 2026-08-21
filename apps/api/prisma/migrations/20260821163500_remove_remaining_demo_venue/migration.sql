-- Remove the final manually created test venue and its cascading test offer.
DELETE FROM "restaurants"
WHERE "id" = 'cmt2wer260004mu2c015yi4fk'
  AND "name" = 'demo'
  AND "address" = 'Natig Aliyev 3E'
  AND "cuisine" = 'Venue';
