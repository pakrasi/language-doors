#!/usr/bin/env python3
"""English spec for the Explore experience: 24 sentence variants with role-tagged tokens.
Roles (alignment groups):
  subj  subject of clause 1        subj2 subject of clause 2
  door  the door (modal/operator)  door2 door of clause 2
  verb  main verb / slot verb      verb2 main verb of clause 2
  obj   object or destination      obj2  object of clause 2
  adv   time/place adverbial       dur   duration phrase
  aux   tense/aspect carrier       neg   negation word
  q     question marker/word       glue  connector
  x     no English counterpart (a language may add these)
A token may carry several roles joined with '|', e.g. "can't" = door|neg.
"""
import json, pathlib

M = []
def meaning(id, title, function, recipe, variants):
    M.append({"id": id, "title": title, "function": function, "recipe": recipe, "variants": variants})
def v(id, label, tokens, hint):
    return {"id": id, "label": label, "tokens": [[t, g] for t, g in tokens], "hint": hint}

meaning("want", "I want to learn Khasi.", "F-WANT", ["D-WANT"], [
    v("now", "now", [("I", "subj"), ("want", "door"), ("to learn", "verb"), ("Khasi.", "obj")], "Present. The door WANT with a verb slot."),
    v("past", "yesterday", [("I", "subj"), ("wanted", "door|aux"), ("to learn", "verb"), ("Khasi.", "obj")], "Past. Where does the tense go: on the door, on an auxiliary, on a particle?"),
    v("neg", "not", [("I", "subj"), ("don't", "neg|aux"), ("want", "door"), ("to learn", "verb"), ("Khasi.", "obj")], "Negative. Where does the negation word sit relative to the door?"),
    v("q", "you?", [("Do", "q|aux"), ("you", "subj"), ("want", "door"), ("to learn", "verb"), ("Khasi?", "obj")], "Yes/no question to a friend (informal you). Particle, inversion, or intonation only?"),
])
meaning("decline", "I can't come because I have to work.", "F-ACCEPT-DECLINE", ["D-CAN", "G-BECAUSE", "D-HAVE-TO"], [
    v("now", "now", [("I", "subj"), ("can't", "door|neg"), ("come", "verb"), ("because", "glue"), ("I", "subj2"), ("have to", "door2"), ("work.", "verb2")], "Two doors joined by BECAUSE. Watch what the glue does to the second clause."),
    v("past", "yesterday", [("I", "subj"), ("couldn't", "door|neg|aux"), ("come", "verb"), ("because", "glue"), ("I", "subj2"), ("had to", "door2|aux"), ("work.", "verb2")], "Past of both doors."),
    v("fut", "tomorrow", [("I", "subj"), ("won't be able to", "door|neg|aux"), ("come", "verb"), ("because", "glue"), ("I", "subj2"), ("will have to", "door2|aux"), ("work.", "verb2")], "Future of both doors. CAN needs a substitute in English; does it in your language?"),
    v("although", "although", [("I", "subj"), ("can", "door"), ("come", "verb"), ("although", "glue"), ("I", "subj2"), ("have to", "door2"), ("work.", "verb2")], "Glue swapped to ALTHOUGH, first door now positive."),
])
meaning("like", "I like coffee.", "F-LIKE", ["D-LIKE"], [
    v("now", "now", [("I", "subj"), ("like", "door"), ("coffee.", "obj")], "In several languages the liked thing is the grammatical subject and the liker is marked dative."),
    v("neg", "not", [("I", "subj"), ("don't", "neg|aux"), ("like", "door"), ("coffee.", "obj")], "Negative."),
    v("she", "she", [("She", "subj"), ("likes", "door"), ("coffee.", "obj")], "Third person: watch agreement, gender markers, and what changes on the door."),
    v("q", "you?", [("Do", "q|aux"), ("you", "subj"), ("like", "door"), ("coffee?", "obj")], "Question to a friend (informal you)."),
])
meaning("go", "I go to the market.", "F-DESCRIBE-PAST", ["D-GOING-TO", "T-PRES", "T-PAST", "T-FUT"], [
    v("habit", "every day", [("I", "subj"), ("go", "verb"), ("to the market", "obj"), ("every day.", "adv")], "Habitual present."),
    v("prog", "right now", [("I", "subj"), ("am", "aux"), ("going", "verb"), ("to the market", "obj"), ("now.", "adv")], "Progressive: an auxiliary, a particle, or nothing at all?"),
    v("past", "yesterday", [("I", "subj"), ("went", "verb|aux"), ("to the market", "obj"), ("yesterday.", "adv")], "Simple past of GO."),
    v("fut", "tomorrow", [("I", "subj"), ("will", "aux"), ("go", "verb"), ("to the market", "obj"), ("tomorrow.", "adv")], "Future: a future form, or present plus a time word?"),
    v("neg", "not", [("I", "subj"), ("am", "aux"), ("not", "neg"), ("going", "verb"), ("to the market.", "obj")], "Negative progressive."),
])
meaning("live", "I have been living here for two years.", "F-INTRO", ["D-HAVE-BEEN-ING", "G-FOR-SINCE"], [
    v("now", "still here", [("I", "subj"), ("have been", "aux"), ("living", "verb"), ("here", "adv"), ("for two years.", "dur")], "Started in the past, still true. English uses the perfect continuous; most languages use the present plus a duration word."),
    v("past", "finished", [("I", "subj"), ("lived", "verb|aux"), ("there", "adv"), ("for two years.", "dur")], "Finished period in the past."),
    v("fut", "next year", [("Next year", "adv"), ("I", "subj"), ("will have lived", "verb|aux"), ("here", "adv"), ("for three years.", "dur")], "Future perfect, or whatever the language uses instead."),
    v("q", "how long?", [("How long", "q"), ("have", "aux"), ("you", "subj"), ("been living", "verb|aux"), ("here?", "adv")], "Question with a wh-word (informal you)."),
])
meaning("if", "If I had time, I would travel.", "F-REGRET", ["G-IF", "D-IF-I-WERE", "D-IF-HAD-KNOWN"], [
    v("real", "real", [("If", "glue"), ("I", "subj"), ("have", "verb"), ("time,", "obj"), ("I", "subj2"), ("will", "aux"), ("travel.", "verb2")], "First conditional: possible."),
    v("unreal", "unreal", [("If", "glue"), ("I", "subj"), ("had", "verb|aux"), ("time,", "obj"), ("I", "subj2"), ("would", "aux"), ("travel.", "verb2")], "Second conditional: hypothetical now."),
    v("past", "too late", [("If", "glue"), ("I", "subj"), ("had had", "verb|aux"), ("time,", "obj"), ("I", "subj2"), ("would have", "aux"), ("travelled.", "verb2")], "Third conditional: hypothetical past, regret."),
])

out = {"roles": {
    "subj": "subject", "subj2": "subject (clause 2)", "door": "door", "door2": "door (clause 2)", "verb": "verb in the slot", "verb2": "verb (clause 2)",
    "obj": "object / destination", "obj2": "object (clause 2)", "adv": "time or place", "dur": "duration", "aux": "tense carrier", "neg": "negation", "q": "question marker", "glue": "glue", "x": "added by this language"},
    "meanings": M}
p = pathlib.Path(__file__).resolve().parent.parent / "data" / "sentences" / "en.json"
p.parent.mkdir(exist_ok=True)
p.write_text(json.dumps(out, ensure_ascii=False, indent=1))
print("wrote", p, sum(len(m["variants"]) for m in M), "variants")
