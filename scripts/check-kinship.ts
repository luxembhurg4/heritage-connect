// Self-check for kinship reckoning. Run: npm test
import assert from "node:assert/strict";
import { relate, type Kin } from "../src/lib/kinship.ts";

const M = "male" as const;
const F = "female" as const;
// Juan's side: grandparents → father + aunt → Juan, his brother, a half-brother,
// a cousin and her daughter. His wife Ana's side joins through their marriage.
const people: Kin[] = [
  { _id: "lolo", name: "Lolo", sex: M, partnerId: "lola" },
  { _id: "lola", name: "Lola", sex: F, partnerId: "lolo" },
  { _id: "pedro", name: "Pedro", sex: M, fatherId: "lolo", motherId: "lola", partnerId: "rosa" },
  { _id: "rosa", name: "Rosa", sex: F, partnerId: "pedro" },
  { _id: "maria", name: "Maria", sex: F, fatherId: "lolo", motherId: "lola" },
  { _id: "juan", name: "Juan", sex: M, fatherId: "pedro", motherId: "rosa", partnerId: "ana" },
  { _id: "jose", name: "Jose", sex: M, fatherId: "pedro", motherId: "rosa" },
  { _id: "half", name: "Half", sex: M, fatherId: "pedro", motherId: "other" },
  { _id: "other", name: "Other", sex: F },
  { _id: "carla", name: "Carla", sex: F, motherId: "maria" },
  { _id: "bea", name: "Bea", sex: F, motherId: "carla" },
  // Ana's side: her father and uncle, the uncle's daughter and her husband,
  // and Ana's son from before she married Juan.
  { _id: "ana", name: "Ana", sex: F, fatherId: "tomas", partnerId: "juan" },
  { _id: "tomas", name: "Tomas", sex: M, fatherId: "abuelo" },
  { _id: "tio", name: "Tio", sex: M, fatherId: "abuelo" },
  { _id: "abuelo", name: "Abuelo", sex: M },
  { _id: "prima", name: "Prima", sex: F, fatherId: "tio", partnerId: "esposo" },
  { _id: "esposo", name: "Esposo", sex: M, partnerId: "prima" },
  { _id: "nino", name: "Nino", sex: M, motherId: "ana" },
  { _id: "stranger", name: "Stranger" },
];
const phrase = (a: string, b: string) => relate(people, a, b)?.phrase;

// Blood
assert.equal(phrase("juan", "pedro"), "father");
assert.equal(phrase("juan", "lolo"), "grandfather");
assert.equal(phrase("bea", "lola"), "great-grandmother");
assert.equal(phrase("lolo", "bea"), "great-granddaughter");
assert.equal(phrase("juan", "jose"), "brother");
assert.equal(phrase("juan", "half"), "half-brother");
assert.equal(phrase("juan", "maria"), "aunt");
assert.equal(phrase("maria", "juan"), "nephew");
assert.equal(phrase("bea", "pedro"), "great-uncle");
assert.equal(phrase("juan", "carla"), "first cousin");
assert.equal(phrase("juan", "bea"), "first cousin once removed");
assert.equal(phrase("bea", "juan"), "first cousin once removed");
// Marriage
assert.equal(phrase("juan", "ana"), "wife");
assert.equal(phrase("juan", "tomas"), "father-in-law");
assert.equal(phrase("jose", "ana"), "sister-in-law");
assert.equal(phrase("tomas", "juan"), "son-in-law");
assert.equal(phrase("juan", "nino"), "stepson");
assert.equal(phrase("juan", "esposo"), "wife's first cousin's husband");
// Nobody recorded between them
assert.equal(relate(people, "juan", "stranger"), null);

// The in-betweens: Juan → father → grandparent → aunt → cousin.
const path = relate(people, "juan", "carla")!.path;
assert.equal(path.length, 5);
assert.deepEqual([path[0].person._id, path[1].person._id, path[4].person._id], ["juan", "pedro", "carla"]);
assert.deepEqual(path.map((l) => l.word), [undefined, "father", path[2].word, "daughter", "daughter"]);

// Married cousins: their spouse is still "husband", not "second cousin".
const cousinsWed: Kin[] = [
  ...people,
  { _id: "x", name: "X", sex: M, fatherId: "jose", partnerId: "y" },
  { _id: "y", name: "Y", sex: F, motherId: "bea", partnerId: "x" },
];
assert.equal(relate(cousinsWed, "y", "x")?.phrase, "husband");

console.log("kinship: ok");
