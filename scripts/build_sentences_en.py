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
    v("now", "now", [("I", "subj"), ("want", "door"), ("to learn", "verb"), ("Khasi.", "obj")], "Present: \"want\" followed by a verb."),
    v("past", "yesterday", [("I", "subj"), ("wanted", "door|aux"), ("to learn", "verb"), ("Khasi.", "obj")], "Past. See which word changes in each language."),
    v("neg", "not", [("I", "subj"), ("don't", "neg|aux"), ("want", "door"), ("to learn", "verb"), ("Khasi.", "obj")], "Negative. Look at where the \"not\" word sits next to \"want\"."),
    v("q", "you?", [("Do", "q|aux"), ("you", "subj"), ("want", "door"), ("to learn", "verb"), ("Khasi?", "obj")], "Question to a friend. Some languages add a question word; German swaps the word order."),
])
meaning("decline", "I can't come because I have to work.", "F-ACCEPT-DECLINE", ["D-CAN", "G-BECAUSE", "D-HAVE-TO"], [
    v("now", "now", [("I", "subj"), ("can't", "door|neg"), ("come", "verb"), ("because", "glue"), ("I", "subj2"), ("have to", "door2"), ("work.", "verb2")], "Two verb frames joined by \"because\". In German the verb after \"weil\" goes to the end."),
    v("past", "yesterday", [("I", "subj"), ("couldn't", "door|neg|aux"), ("come", "verb"), ("because", "glue"), ("I", "subj2"), ("had to", "door2|aux"), ("work.", "verb2")], "Past, in both halves of the sentence."),
    v("fut", "tomorrow", [("I", "subj"), ("won't be able to", "door|neg|aux"), ("come", "verb"), ("because", "glue"), ("I", "subj2"), ("will have to", "door2|aux"), ("work.", "verb2")], "Future. English swaps \"can\" for \"be able to\"; see which languages do the same."),
    v("although", "although", [("I", "subj"), ("can", "door"), ("come", "verb"), ("although", "glue"), ("I", "subj2"), ("have to", "door2"), ("work.", "verb2")], "\"Although\" instead of \"because\"; the first half is now positive."),
])
meaning("like", "I like coffee.", "F-LIKE", ["D-LIKE"], [
    v("now", "now", [("I", "subj"), ("like", "door"), ("coffee.", "obj")], "In Hindi you say it the other way round: \"mujhe coffee pasand hai\", roughly \"coffee is pleasing to me\"."),
    v("neg", "not", [("I", "subj"), ("don't", "neg|aux"), ("like", "door"), ("coffee.", "obj")], "Negative."),
    v("she", "she", [("She", "subj"), ("likes", "door"), ("coffee.", "obj")], "She instead of I. See which words change to agree with her."),
    v("q", "you?", [("Do", "q|aux"), ("you", "subj"), ("like", "door"), ("coffee?", "obj")], "Question to a friend."),
])
meaning("go", "I go to the market.", "F-DESCRIBE-PAST", ["D-GOING-TO", "T-PRES", "T-PAST", "T-FUT"], [
    v("habit", "every day", [("I", "subj"), ("go", "verb"), ("to the market", "obj"), ("every day.", "adv")], "Something you do regularly."),
    v("prog", "right now", [("I", "subj"), ("am", "aux"), ("going", "verb"), ("to the market", "obj"), ("now.", "adv")], "\"I'm going\" right now. German and French use the same form as \"I go\"."),
    v("past", "yesterday", [("I", "subj"), ("went", "verb|aux"), ("to the market", "obj"), ("yesterday.", "adv")], "Past."),
    v("fut", "tomorrow", [("I", "subj"), ("will", "aux"), ("go", "verb"), ("to the market", "obj"), ("tomorrow.", "adv")], "Future. Swiss German just uses the present with \"tomorrow\"; German adds \"werde\"."),
    v("neg", "not", [("I", "subj"), ("am", "aux"), ("not", "neg"), ("going", "verb"), ("to the market.", "obj")], "Not going, right now."),
])
meaning("live", "I have been living here for two years.", "F-INTRO", ["D-HAVE-BEEN-ING", "G-FOR-SINCE"], [
    v("now", "still here", [("I", "subj"), ("have been", "aux"), ("living", "verb"), ("here", "adv"), ("for two years.", "dur")], "Started in the past and still true. English says \"have been living\"; German and French use the present with \"for two years\"."),
    v("past", "finished", [("I", "subj"), ("lived", "verb|aux"), ("there", "adv"), ("for two years.", "dur")], "A finished stretch of time in the past."),
    v("fut", "next year", [("Next year", "adv"), ("I", "subj"), ("will have lived", "verb|aux"), ("here", "adv"), ("for three years.", "dur")], "\"Will have lived\". Most languages use a simpler form."),
    v("q", "how long?", [("How long", "q"), ("have", "aux"), ("you", "subj"), ("been living", "verb|aux"), ("here?", "adv")], "A \"how long\" question to a friend."),
])
meaning("if", "If I had time, I would travel.", "F-REGRET", ["G-IF", "D-IF-I-WERE", "D-IF-HAD-KNOWN"], [
    v("real", "real", [("If", "glue"), ("I", "subj"), ("have", "verb"), ("time,", "obj"), ("I", "subj2"), ("will", "aux"), ("travel.", "verb2")], "Possible: it could still happen."),
    v("unreal", "unreal", [("If", "glue"), ("I", "subj"), ("had", "verb|aux"), ("time,", "obj"), ("I", "subj2"), ("would", "aux"), ("travel.", "verb2")], "Imagined: it isn't true now."),
    v("past", "too late", [("If", "glue"), ("I", "subj"), ("had had", "verb|aux"), ("time,", "obj"), ("I", "subj2"), ("would have", "aux"), ("travelled.", "verb2")], "Too late: it didn't happen."),
])

out = {"roles": {
    "subj": "subject", "subj2": "subject (second half)", "door": "verb frame", "door2": "verb frame (second half)", "verb": "main verb", "verb2": "main verb (second half)",
    "obj": "object or place", "obj2": "object (second half)", "adv": "time or place", "dur": "duration", "aux": "tense word", "neg": "\"not\" word", "q": "question word", "glue": "linking word", "x": "no English match"},
    "meanings": M}
p = pathlib.Path(__file__).resolve().parent.parent / "data" / "sentences" / "en.json"
p.parent.mkdir(exist_ok=True)
p.write_text(json.dumps(out, ensure_ascii=False, indent=1))
print("wrote", p, sum(len(m["variants"]) for m in M), "variants")
