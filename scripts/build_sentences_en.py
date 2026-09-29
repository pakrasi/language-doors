#!/usr/bin/env python3
"""English spec for the Explore experience: 27 sentence variants with role-tagged tokens.
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
def meaning(id, level, title, function, recipe, variants):
    M.append({"id": id, "level": level, "title": title, "function": function, "recipe": recipe, "variants": variants})
def v(id, label, tokens, hint):
    return {"id": id, "label": label, "tokens": [[t, g] for t, g in tokens], "hint": hint}

meaning("dog", "A2", "My landlord wants to visit tomorrow, so I have to hide the dog.", "F-GIVE-REASONS", ["D-WANT", "D-HAVE-TO", "G-SO"], [
    v("now", "tomorrow", [("My landlord", "subj"), ("wants", "door"), ("to visit", "verb"), ("tomorrow,", "adv"), ("so", "glue"), ("I", "subj2"), ("have to", "door2"), ("hide", "verb2"), ("the dog.", "obj2")], "Two verb frames, \"wants to visit\" and \"have to hide\", joined by \"so\". After German \"also\" the verb jumps ahead of \"ich\"."),
    v("past", "yesterday", [("My landlord", "subj"), ("wanted", "door|aux"), ("to visit", "verb"), ("yesterday,", "adv"), ("so", "glue"), ("I", "subj2"), ("had to", "door2|aux"), ("hide", "verb2"), ("the dog.", "obj2")], "Past in both halves. See whether each language puts the tense on the door (wanted, had to) or somewhere else."),
    v("neg", "not", [("My landlord", "subj"), ("doesn't", "neg|aux"), ("want", "door"), ("to visit,", "verb"), ("so", "glue"), ("I", "subj2"), ("don't", "neg|aux"), ("have to", "door2"), ("hide", "verb2"), ("the dog.", "obj2")], "Two negatives. \"Don't have to\" means no need, not a ban; German says \"muss nicht\", French changes the verb entirely."),
    v("q", "you?", [("Your landlord", "subj"), ("wants", "door"), ("to visit", "verb"), ("tomorrow,", "adv"), ("so", "glue"), ("do", "q|aux"), ("you", "subj2"), ("have to", "door2"), ("hide", "verb2"), ("the dog?", "obj2")], "Question to a friend. Only the second half is a question; see where each language puts its question marker."),
])
meaning("cant", "A2", "We can't come because the kids hid the car keys.", "F-ACCEPT-DECLINE", ["D-CAN", "G-BECAUSE", "D-ABLE-TO"], [
    v("now", "now", [("We", "subj"), ("can't", "door|neg"), ("come", "verb"), ("because", "glue"), ("the kids", "subj2"), ("hid", "verb2|aux"), ("the car keys.", "obj2")], "\"Because\" starts the reason. After German \"weil\" the verb goes to the end: \"weil die Kinder ... versteckt haben\"."),
    v("past", "last week", [("We", "subj"), ("couldn't", "door|neg|aux"), ("come", "verb"), ("because", "glue"), ("the kids", "subj2"), ("hid", "verb2|aux"), ("the car keys.", "obj2")], "\"Can't\" becomes \"couldn't\". The second half was already past, so only the first half changes."),
    v("fut", "tomorrow", [("We", "subj"), ("won't be able to", "door|neg|aux"), ("come", "verb"), ("tomorrow", "adv"), ("because", "glue"), ("the kids", "subj2"), ("hid", "verb2|aux"), ("the car keys.", "obj2")], "Future. English swaps \"can\" for \"be able to\"; see which languages just put their normal \"can\" in the future."),
    v("although", "although", [("We", "subj"), ("can", "door"), ("still", "adv"), ("come,", "verb"), ("although", "glue"), ("the kids", "subj2"), ("hid", "verb2|aux"), ("the car keys.", "obj2")], "\"Although\" instead of \"because\", and the first half turns positive. German \"obwohl\" also sends the verb to the end."),
])
meaning("like", "A1", "My sister likes coffee.", "F-LIKE", ["D-LIKE"], [
    v("now", "she", [("My sister", "subj"), ("likes", "door"), ("coffee.", "obj")], "In Hindi and Spanish the coffee is the subject: roughly \"coffee pleases my sister\" (\"a mi hermana le gusta el café\")."),
    v("neg", "not", [("She", "subj"), ("doesn't", "neg|aux"), ("like", "door"), ("coffee.", "obj")], "Negative. English needs \"doesn't\"; most languages just add their \"not\" word. Look where it sits."),
    v("they", "they", [("My parents", "subj"), ("like", "door"), ("coffee.", "obj")], "Plural. English only loses the -s; see which words change to agree with two people."),
    v("q", "you?", [("Do", "q|aux"), ("you", "subj"), ("like", "door"), ("coffee?", "obj")], "Question to a friend. English adds \"do\"; others add a question word, flip the order, or just raise the voice."),
])
meaning("go", "A1", "My grandparents go to the market every Sunday.", "F-DESCRIBE-PAST", ["D-GOING-TO", "T-PRES", "T-PAST", "T-FUT"], [
    v("habit", "every Sunday", [("My grandparents", "subj"), ("go", "verb"), ("to the market", "obj"), ("every Sunday.", "adv")], "Something done regularly. \"Every Sunday\" does the work; the verb is the plain present."),
    v("prog", "right now", [("They", "subj"), ("are", "aux"), ("going", "verb"), ("to the market", "obj"), ("right now.", "adv")], "Happening right now. German and French use the same form as \"every Sunday\"; Hindi adds \"rahe hain\"."),
    v("past", "yesterday", [("They", "subj"), ("went", "verb|aux"), ("to the market", "obj"), ("yesterday.", "adv")], "Past. English swaps the whole word (go, went); see which languages add a tense word instead."),
    v("fut", "tomorrow", [("They", "subj"), ("will", "aux"), ("go", "verb"), ("to the market", "obj"), ("tomorrow.", "adv")], "Future. Swiss German just uses the present with \"tomorrow\"; German adds \"werden\"."),
    v("neg", "not", [("They", "subj"), ("aren't", "aux|neg"), ("going", "verb"), ("to the market", "obj"), ("today.", "adv")], "Not going today. Look at where the \"not\" word sits next to the verb."),
])
meaning("live", "B1", "My brother has been living in Shillong for two years.", "F-INTRO", ["D-HAVE-BEEN-ING", "G-FOR-SINCE"], [
    v("now", "still there", [("My brother", "subj"), ("has been", "aux"), ("living", "verb"), ("in Shillong", "adv"), ("for two years.", "dur")], "Started in the past and still true. English says \"has been living\"; German and French use the present with \"for two years\"."),
    v("past", "finished", [("He", "subj"), ("lived", "verb|aux"), ("in Delhi", "adv"), ("for two years.", "dur")], "A finished stretch of time. Compare with the first variant: this is where most languages switch to the past."),
    v("fut", "by June", [("By June", "adv"), ("he", "subj"), ("will have lived", "verb|aux"), ("in Shillong", "adv"), ("for three years.", "dur")], "\"Will have lived\". Most languages use a simpler form here."),
    v("q", "how long?", [("How long", "q"), ("have", "aux"), ("you", "subj"), ("been living", "verb|aux"), ("here?", "adv")], "A \"how long\" question to a friend. See whether the question word comes first or stays at the end."),
])
meaning("rain", "A2", "It's raining, so take an umbrella.", "F-ADVISE", ["G-SO", "T-IMPERATIVE", "D-GOING-TO"], [
    v("now", "now", [("It's", "subj|aux"), ("raining,", "verb"), ("so", "glue"), ("take", "verb2"), ("an umbrella.", "obj2")], "\"It\" points at nothing. German keeps \"es\", Spanish drops it, Hindi says \"rain is happening\". The second half is an order."),
    v("fut", "later", [("It's", "subj|aux"), ("going to", "door"), ("rain", "verb"), ("later,", "adv"), ("so", "glue"), ("take", "verb2"), ("an umbrella.", "obj2")], "\"Going to\" for a prediction. See which languages use a future form and which use the present with \"later\"."),
    v("neg", "not", [("It", "subj"), ("isn't", "aux|neg"), ("raining,", "verb"), ("so", "glue"), ("don't", "neg"), ("take", "verb2"), ("an umbrella.", "obj2")], "A negative order. Hindi uses \"mat\" instead of its usual \"nahin\"; Spanish and Italian change the verb form."),
])
meaning("if", "B1", "If we had time, we would travel.", "F-REGRET", ["G-IF", "D-IF-I-WERE", "D-IF-HAD-KNOWN"], [
    v("real", "real", [("If", "glue"), ("we", "subj"), ("have", "verb"), ("time,", "obj"), ("we", "subj2"), ("will", "aux"), ("travel.", "verb2")], "Possible: it could still happen."),
    v("unreal", "unreal", [("If", "glue"), ("we", "subj"), ("had", "verb|aux"), ("time,", "obj"), ("we", "subj2"), ("would", "aux"), ("travel.", "verb2")], "Imagined: it isn't true now. English uses the past \"had\" for the present."),
    v("past", "too late", [("If", "glue"), ("we", "subj"), ("had had", "verb|aux"), ("time,", "obj"), ("we", "subj2"), ("would have", "aux"), ("travelled.", "verb2")], "Too late: it didn't happen."),
])

out = {"roles": {
    "subj": "subject", "subj2": "subject (second half)", "door": "verb frame", "door2": "verb frame (second half)", "verb": "main verb", "verb2": "main verb (second half)",
    "obj": "object or place", "obj2": "object (second half)", "adv": "time or place", "dur": "duration", "aux": "tense word", "neg": "\"not\" word", "q": "question word", "glue": "linking word", "x": "no English match"},
    "meanings": M}
p = pathlib.Path(__file__).resolve().parent.parent / "data" / "sentences" / "en.json"
p.parent.mkdir(exist_ok=True)
p.write_text(json.dumps(out, ensure_ascii=False, indent=1))
print("wrote", p, sum(len(m["variants"]) for m in M), "variants")
