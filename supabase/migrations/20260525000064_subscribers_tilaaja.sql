-- user_role: subscriber (erillinen migraatio — enum-arvoa ei voi käyttää samassa transaktiossa)
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'subscriber';
