// node scripts/test_match.mjs — checks match.js with plain assert. Prints "ok".
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { check, acceptedForWord, acceptedForChunk } = require('../match.js');

const tisch = { w: 'Tisch', art: 'der', pos: 'noun', alt: [] };
const rad = { w: 'Fahrrad', art: 'das', pos: 'noun', alt: ['das Rad'] };
const noun = (input, word) => check(input, acceptedForWord(word), { pos: 'noun' });

// accepted lists
assert.deepEqual(acceptedForWord(tisch), ['der Tisch']);
assert.deepEqual(acceptedForWord(rad), ['das Fahrrad', 'das Rad']);
assert.deepEqual(acceptedForWord({ w: 'schnell', art: '', pos: 'adj', alt: ['rasch'] }), ['schnell', 'rasch']);
assert.deepEqual(acceptedForChunk('A [x] / B'), ['A [x]', 'B']);
assert.deepEqual(acceptedForChunk('A [x] / B', 'A b c.'), ['A b c.', 'A [x]', 'B']);

// exact, case-insensitive, punctuation and spacing
let r = noun('der Tisch', tisch); assert.ok(r.ok && r.exact); assert.equal(r.fixed, 'der Tisch');
r = noun('  DER   tisch. ', tisch); assert.ok(r.ok && r.exact);

// umlaut and ß spellings
r = check('die Tuer', ['die Tür'], { pos: 'noun' }); assert.ok(r.ok); assert.equal(r.exact, false); assert.equal(r.fixed, 'die Tür');
r = check('die Strasse', ['die Straße'], { pos: 'noun' }); assert.ok(r.ok && !r.exact); assert.equal(r.fixed, 'die Straße');
r = check('Groesse', ['Größe']); assert.ok(r.ok); assert.equal(r.fixed, 'Größe');
r = check('schön', ['schoen']); assert.ok(r.ok);          // either side may use the digraph
r = check('müde', ['müde']); assert.ok(r.ok && r.exact);

// wrong or missing article
r = noun('die Tisch', tisch); assert.equal(r.ok, false); assert.equal(r.articleMiss, true); assert.equal(r.fixed, 'der Tisch');
r = noun('Tisch', tisch); assert.equal(r.ok, false); assert.equal(r.articleMiss, true);
r = noun('der Stuhl', tisch); assert.equal(r.ok, false); assert.equal(r.articleMiss, false); assert.equal(r.close, false);
r = check('Tisch', ['der Tisch']); assert.equal(r.articleMiss, false, 'article check only for nouns');

// close typo: one edit on 6+ letters
r = noun('das Fahrad', rad); assert.equal(r.ok, false); assert.equal(r.close, true); assert.equal(r.fixed, 'das Fahrrad');
r = check('Bahnhfo', ['Bahnhof']); assert.equal(r.close, true, 'transposition');
r = check('Bahnhoff', ['Bahnhof']); assert.equal(r.close, true, 'insertion');
r = check('Tich', ['Tisch']); assert.equal(r.close, false, 'too short for close');
r = check('Bahnhfoo', ['Bahnhof']); assert.equal(r.close, false, 'two edits');
r = noun('der Fahrad', rad); assert.equal(r.close, false, 'wrong article is not close');

// alternatives and "Also correct"
r = noun('das Rad', rad); assert.ok(r.ok); assert.equal(r.matched, 'das Rad'); assert.deepEqual(r.others, ['das Fahrrad']);

// chunk variants with slots
const wuerde = acceptedForChunk('Würden Sie bitte [Infinitiv]? / Würde es Ihnen etwas ausmachen, [zu + Infinitiv]?', 'Würden Sie bitte das Fenster zumachen?');
r = check('Würden Sie bitte das Fenster zumachen', wuerde); assert.ok(r.ok && r.exact); assert.equal(r.matched, wuerde[0]);
assert.deepEqual(r.others, wuerde.slice(1));
r = check('würden sie bitte kurz warten?', wuerde); assert.ok(r.ok); assert.equal(r.matched, 'Würden Sie bitte [Infinitiv]?'); assert.equal(r.fixed, 'Würden Sie bitte kurz warten?');
assert.deepEqual(r.others, [wuerde[0], wuerde[2]]);
r = check('Würde es Ihnen etwas ausmachen, das Fenster zu schliessen?', wuerde); assert.ok(r.ok); assert.equal(r.fixed, 'Würde es Ihnen etwas ausmachen, das Fenster zu schliessen?');
r = check('Würden Sie bitte', wuerde); assert.equal(r.ok, false, 'a slot needs at least one word');
r = check('Würden Sie bitte eins zwei drei vier fünf sechs sieben', ['Würden Sie bitte [Infinitiv]']); assert.equal(r.ok, false, 'a slot takes at most 6 words');
r = check('Würden Sie bitte eins zwei drei vier fünf sechs', ['Würden Sie bitte [Infinitiv]']); assert.ok(r.ok);
// optional parts and slots glued to a word
const freue = acceptedForChunk('Ich freue mich (schon) auf [Nomen]');
assert.ok(check('Ich freue mich auf das Wochenende', freue).ok);
assert.ok(check('ich freue mich schon auf den Urlaub!', freue).ok);
assert.ok(check('Mein Lieblingsessen ist Pizza', acceptedForChunk('Mein Lieblings[Nomen] ist [Nomen]')).ok);
assert.ok(check('Meine Tasche bringt mich um', acceptedForChunk('Mein(e) [Nomen] bringt mich um')).ok);
assert.ok(check('Seit wann wohnst du hier?', acceptedForChunk('Seit wann [Verb im Präsens] du ...?')).ok);
// slots off: brackets are literal
assert.equal(check('Würden Sie bitte warten', ['Würden Sie bitte [Infinitiv]'], { slots: false }).ok, false);

// grammar items: commas don't matter; strict case only when asked
r = check('Ich glaube dass er morgen kommt', ['Ich glaube, dass er morgen kommt.']); assert.ok(r.ok); assert.equal(r.fixed, 'Ich glaube, dass er morgen kommt.');
r = check('das thema', ['das Thema'], { strictCase: true }); assert.equal(r.ok, false); assert.equal(r.caseMiss, true); assert.equal(r.fixed, 'das Thema');
r = check('das Thema', ['das Thema'], { strictCase: true }); assert.ok(r.ok && r.exact);
r = check('das thema', ['das Thema']); assert.ok(r.ok);
r = check('Das Treffen', ['das Treffen'], { strictCase: true }); assert.equal(r.ok, false);

// empty input
r = check('', ['der Tisch'], { pos: 'noun' }); assert.equal(r.ok, false); assert.equal(r.articleMiss, false);

console.log('ok');
