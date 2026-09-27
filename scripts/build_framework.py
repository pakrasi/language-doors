#!/usr/bin/env python3
"""Builds data/framework.json, the language-neutral master.

Items: (id, layer, level, english_chunk, slot_type, note)
  layer: function | door | turn | glue | slot | lexicon | sound | chunk
  slot_type: N (noun/adjective) | TO (to-infinitive) | V (bare verb) | ING | CL (clause) | - (none)
Scenarios: (id, level, situation, task, function_id, recipe_ids, turn)
"""
import json, pathlib

LEVELS = ["A1", "A2", "B1", "B2", "C1"]
LAYERS = [
    ("function", "Functions", "What you are doing with the sentence"),
    ("door", "Doors", "Verb frames with one open slot"),
    ("turn", "Turns", "The same door rotated through time, polarity and mood"),
    ("glue", "Glue", "Connectors and prepositions, and the word-order rule each triggers"),
    ("slot", "Slot grammar", "What happens inside the slot: pronouns, articles, case, agreement"),
    ("lexicon", "Lexicon", "The words that fill the slots, by topic"),
    ("sound", "Sound", "Pronunciation, stress, intonation, listening"),
    ("chunk", "Chunks", "Fixed phrases with no slot"),
]

I = []
def add(level, layer, rows):
    for r in rows:
        id_, en, slot, note = (list(r) + ["", ""])[:4] if len(r) < 4 else r
        I.append({"id": id_, "layer": layer, "level": level, "en": en, "slot": slot, "note": note})

# ---------------- A1 ----------------
add("A1", "function", [
    ("F-GREET", "Greet someone and say goodbye", "-", "Formal and informal versions"),
    ("F-INTRO", "Introduce yourself: name, where you are from, what you do", "-", ""),
    ("F-THANK", "Thank someone and respond to thanks", "-", ""),
    ("F-ASK-PRICE", "Ask how much something costs", "-", ""),
    ("F-ASK-WAY", "Ask where something is and understand a simple answer", "-", ""),
    ("F-NOT-UNDERSTAND", "Say you don't understand, ask someone to repeat or slow down", "-", "The most important A1 function: it keeps the conversation alive"),
    ("F-LIKE", "Say what you like and don't like", "-", ""),
    ("F-WANT", "Say what you want, order food and drink", "-", ""),
])
add("A1", "door", [
    ("D-BE", "I am ___", "N", "Identity, origin, job, state. The first door in every language"),
    ("D-HAVE", "I have ___", "N", "Possession; in many languages also age, hunger, fear"),
    ("D-THERE-IS", "There is / there are ___", "N", "Existence"),
    ("D-LIKE", "I like ___", "N", "In many languages the liked thing is the subject"),
    ("D-WANT", "I want ___ / I want to ___", "TO", "Blunt in most languages; pair with D-WOULD-LIKE"),
    ("D-WOULD-LIKE", "I'd like ___ / I'd like to ___", "TO", "The polite version of D-WANT, used for ordering"),
    ("D-NEED", "I need ___ / I need to ___", "TO", ""),
    ("D-CAN", "I can ___", "V", "Ability and permission"),
    ("D-GOING-TO", "I'm going to ___", "V", "Intention and near future"),
    ("D-WILL", "I will ___", "V", "Some languages use present tense plus a time word instead"),
])
add("A1", "turn", [
    ("T-PRES", "Present simple", "-", "Habits, facts, and in many languages the default for now"),
    ("T-PROG", "Present continuous (right now)", "-", "Many languages have no separate form; note what is used instead"),
    ("T-PAST", "Past simple, first verbs (was, went, had, did)", "-", "Just enough to say what you did yesterday"),
    ("T-FUT", "Future (going to / will)", "-", ""),
    ("T-NEG", "Negative", "-", "Where the negation word goes and what it attaches to"),
    ("T-Q", "Yes/no question", "-", "Word order, particle, or intonation only"),
    ("T-WH", "Wh-question (who, what, where, when, how much)", "-", ""),
])
add("A1", "glue", [
    ("G-AND", "and", "-", ""), ("G-BUT", "but", "-", ""), ("G-OR", "or", "-", ""),
    ("G-BECAUSE", "because", "-", "First subordinator; note any word-order change"),
    ("G-THEN", "then / after that", "-", ""), ("G-ALSO", "also / too", "-", ""),
    ("G-IN", "in (place, month)", "-", ""), ("G-ON", "on (day, surface)", "-", ""), ("G-AT", "at (time, point)", "-", ""),
    ("G-FROM", "from", "-", ""), ("G-TO", "to (direction)", "-", ""), ("G-WITH", "with", "-", ""),
])
add("A1", "slot", [
    ("S-PRON-SUBJ", "Subject pronouns (I, you, he, she, we, they)", "-", "Include formal you if the language has one"),
    ("S-PRON-OBJ", "Object pronouns (me, you, him, her, us, them)", "-", ""),
    ("S-ARTICLE", "Articles (a, the) or their absence", "-", ""),
    ("S-GENDER", "Noun gender and agreement, if any", "-", "Mark not applicable if the language has none"),
    ("S-PLURAL", "Plural formation", "-", ""),
    ("S-DEMONSTR", "this / that / these / those", "-", ""),
    ("S-NUMBERS", "Numbers 1 to 100, ordinals to 10th", "-", ""),
])
add("A1", "lexicon", [
    ("L-SELF", "Self: name, nationality, job, age", "-", ""),
    ("L-FAMILY", "Family and people", "-", ""),
    ("L-FOOD", "Food and drink, ordering", "-", ""),
    ("L-TIME", "Time, days, months, clock", "-", ""),
    ("L-PLACES", "Places in town, directions", "-", ""),
    ("L-VERBS-CORE", "The 25 core verbs", "-", "go, come, eat, drink, see, do, make, say, know, give, take, live, work, buy, speak, read, write, sleep, play, learn, want, like, need, have, be"),
])
add("A1", "sound", [
    ("P-SOUNDS", "Sounds that do not exist in English", "-", ""),
    ("P-WORD-STRESS", "Word stress and the script, if new", "-", ""),
])
add("A1", "chunk", [
    ("C-HELLO-BYE", "Hello / goodbye", "-", ""), ("C-PLEASE-THANKS", "Please / thank you / you're welcome", "-", ""),
    ("C-SORRY", "Sorry / excuse me", "-", ""), ("C-HOW-MUCH", "How much is it?", "-", ""),
    ("C-WHERE-IS", "Where is ___?", "N", ""), ("C-DONT-UNDERSTAND", "I don't understand", "-", ""),
    ("C-REPEAT-PLEASE", "Could you repeat that, please? / More slowly, please", "-", ""),
    ("C-MY-NAME", "My name is ___ / Nice to meet you", "N", ""),
])

# ---------------- A2 ----------------
add("A2", "function", [
    ("F-INVITE", "Invite someone to do something", "-", ""),
    ("F-ACCEPT-DECLINE", "Accept or decline an invitation, with a reason", "-", ""),
    ("F-SUGGEST", "Suggest a plan, time or place", "-", ""),
    ("F-APOLOGISE", "Apologise and explain", "-", ""),
    ("F-ORDER", "Order in a restaurant, ask for the bill, ask about a dish", "-", ""),
    ("F-ASK-REPEAT", "Ask what a word means, ask someone to spell or explain", "-", ""),
    ("F-DESCRIBE-PAST", "Say what you did yesterday or last weekend, in order", "-", ""),
    ("F-MAKE-PLAN", "Arrange to meet: when, where, confirm", "-", ""),
])
add("A2", "door", [
    ("D-HAVE-TO", "I have to ___", "V", "External obligation"),
    ("D-MUST", "I must ___ / you mustn't ___", "V", "Note whether the negative means prohibition or no need"),
    ("D-SHOULD", "I should ___ / you should ___", "V", "Advice"),
    ("D-COULD", "Could you ___? / I could ___ (past ability)", "V", "Polite request and past of can"),
    ("D-MIGHT", "It might ___ / maybe", "V", "Many languages use an adverb, not a verb"),
    ("D-USED-TO", "I used to ___", "V", "Past habit; often the imperfect tense"),
    ("D-HAVE-DONE", "I have done ___ / I've never ___", "V", "Experience; in some languages the plain spoken past"),
    ("D-WAS-DOING", "I was doing ___ when ___", "V", "Background action; imperfect or progressive past"),
    ("D-VERB-TO", "I hope / plan / decide / try / forget / promise to ___", "TO", "The verb-plus-verb pattern"),
    ("D-VERB-ING", "I enjoy / don't mind / finish / keep ___-ing", "ING", ""),
    ("D-THINK-THAT", "I think (that) ___ / I know that ___", "CL", "First clause door"),
    ("D-LETS", "Let's ___ / Shall we ___?", "V", ""),
])
add("A2", "turn", [
    ("T-PAST-PROG", "Past continuous or imperfect (was doing)", "-", ""),
    ("T-PRES-PERF", "Present perfect (have done)", "-", "Say what this tense actually does in this language"),
    ("T-COND1", "First conditional (if it rains, I'll stay)", "-", ""),
    ("T-PROG-FUT", "Present tense for arranged future (I'm meeting her tomorrow)", "-", ""),
    ("T-IMPERATIVE", "Imperative, formal and informal", "-", ""),
])
add("A2", "glue", [
    ("G-SO", "so (result)", "-", ""), ("G-WHEN", "when", "-", ""), ("G-BEFORE-AFTER", "before / after", "-", ""),
    ("G-IF", "if", "-", ""), ("G-THAT", "that (I think that ___)", "-", ""),
    ("G-WHO-WHICH", "who / which / that (relative)", "-", "First relative clause"),
    ("G-FOR-SINCE", "for (a year) / since (Monday)", "-", ""), ("G-UNTIL", "until", "-", ""),
    ("G-ABOUT", "about", "-", ""), ("G-SEQUENCE", "first / then / after that / finally", "-", ""),
])
add("A2", "slot", [
    ("S-POSSESSIVE", "Possessives (my, your, his, her, our, their)", "-", ""),
    ("S-QUANTIFIERS", "some / any / much / many / a lot of / a little", "-", ""),
    ("S-COMPARATIVE", "Comparatives (bigger than, more expensive than)", "-", ""),
    ("S-TOO-ENOUGH", "too / enough / very", "-", ""),
    ("S-OBJECT-CASE", "Indirect object marking (to me, for him): dative or preposition", "-", ""),
])
add("A2", "lexicon", [
    ("L-TRAVEL", "Travel, transport, tickets, hotel", "-", ""),
    ("L-SHOPPING", "Shopping, clothes, money", "-", ""),
    ("L-HEALTH", "Health, body, at the doctor", "-", ""),
    ("L-WORK", "Work and study", "-", ""),
    ("L-WEATHER", "Weather and seasons", "-", ""),
    ("L-ROUTINE", "Daily routine, house, chores", "-", ""),
])
add("A2", "sound", [
    ("P-SENTENCE-STRESS", "Sentence stress and rhythm", "-", ""),
    ("P-Q-INTONATION", "Question intonation", "-", ""),
])
add("A2", "chunk", [
    ("C-WOULD-YOU-LIKE", "Would you like to ___?", "V", ""), ("C-THANKS-BUT", "Thanks, but ___ / That's kind, but ___", "-", ""),
    ("C-HOW-ABOUT", "How about ___? / What about ___?", "N", ""), ("C-SORRY-LATE", "Sorry I'm late", "-", ""),
    ("C-BILL", "The bill, please", "-", ""), ("C-WHAT-MEAN", "What does ___ mean?", "N", ""),
    ("C-SEE-YOU", "See you then / see you tomorrow", "-", ""), ("C-SOUNDS-GOOD", "Sounds good / OK, fine", "-", ""),
])

# ---------------- B1 ----------------
add("B1", "function", [
    ("F-OPINION", "Give an opinion and ask for one", "-", ""),
    ("F-AGREE-DISAGREE", "Agree, disagree, partly agree", "-", ""),
    ("F-GIVE-REASONS", "Give reasons and examples", "-", ""),
    ("F-NARRATE", "Tell a story with background and sequence", "-", ""),
    ("F-COMPLAIN", "Complain politely and ask for a solution", "-", ""),
    ("F-ARRANGE", "Plan something together: propose, reject, compromise, confirm", "-", "The Goethe B1 Sprechen Teil 1 task"),
    ("F-ADVISE", "Give advice and warnings", "-", ""),
    ("F-REPORT", "Report what someone said or asked", "-", ""),
])
add("B1", "door", [
    ("D-HAD-DONE", "I had already ___ when ___", "V", "Past before the past"),
    ("D-HAVE-BEEN-ING", "I have been ___-ing for ___", "ING", "Many languages use present tense plus since/for"),
    ("D-MUST-BE", "He must be ___ / it can't be ___ (deduction)", "N", ""),
    ("D-SHOULD-HAVE", "I should have ___", "V", "Regret"),
    ("D-COULD-HAVE", "I could have ___ / might have ___", "V", ""),
    ("D-WOULD-RATHER", "I'd rather ___ / I'd prefer to ___", "V", ""),
    ("D-IF-I-WERE", "If I were ___, I would ___", "CL", "Second conditional"),
    ("D-WISH", "I wish I had ___ / I wish I could ___", "CL", ""),
    ("D-TOLD-TO", "She told me to ___ / asked me to ___", "TO", ""),
    ("D-SAID-THAT", "He said (that) ___ / asked if ___", "CL", "Reported speech"),
    ("D-COULD-YOU-TELL", "Could you tell me where ___?", "CL", "Indirect question"),
    ("D-PASSIVE", "It was built ___ / it is made of ___", "N", ""),
    ("D-BE-USED-TO", "I'm used to ___-ing / getting used to ___", "ING", ""),
    ("D-LET-MAKE", "She let me ___ / made me ___", "V", ""),
    ("D-SUPPOSED-TO", "I'm supposed to ___ / you'd better ___", "V", ""),
    ("D-ABLE-TO", "I'll be able to ___ / I was able to ___", "V", "Turns of D-CAN that need a substitute"),
])
add("B1", "turn", [
    ("T-PAST-PERF", "Past perfect (had done)", "-", ""),
    ("T-PERF-PROG", "Present perfect continuous (have been doing)", "-", ""),
    ("T-PASSIVE", "Passive, present and past", "-", ""),
    ("T-COND2", "Second conditional (if I had, I would)", "-", ""),
    ("T-REPORTED", "Reported speech: the tense shift", "-", ""),
])
add("B1", "glue", [
    ("G-ALTHOUGH", "although / even though", "-", ""), ("G-WHILE", "while / whereas (contrast)", "-", ""),
    ("G-SINCE-AS", "since / as (reason)", "-", ""), ("G-SO-THAT", "so that (purpose)", "-", ""),
    ("G-IN-ORDER-TO", "in order to / to (purpose)", "-", ""), ("G-WHOSE-WHERE", "whose / where / when (relative)", "-", ""),
    ("G-VERB-PREP", "Verb plus preposition sets: wait for, think about, depend on, interested in", "-", "Belongs on the door card; list the ten most common"),
    ("G-EITHER-NEITHER", "either ... or / neither ... nor", "-", ""),
    ("G-AS-SOON-AS", "as soon as / by the time", "-", ""),
    ("G-INSTEAD-OF", "instead of / apart from", "-", ""),
])
add("B1", "slot", [
    ("S-RELATIVE", "Relative pronouns in all roles", "-", ""),
    ("S-REFLEXIVE", "Reflexive pronouns and reflexive verbs", "-", ""),
    ("S-QUANT-ADV", "Quantity adverbs: a few, a bit, quite, rather, hardly", "-", ""),
    ("S-SUPERLATIVE", "Superlatives and 'as ... as'", "-", ""),
    ("S-GENITIVE", "Possession between nouns (the door of the house, John's car)", "-", ""),
])
add("B1", "lexicon", [
    ("L-OPINION", "Opinion, argument, media", "-", ""),
    ("L-FEELINGS", "Feelings and relationships", "-", ""),
    ("L-ENVIRONMENT", "Environment, city, nature", "-", ""),
    ("L-EDUCATION", "Education, learning, career", "-", ""),
    ("L-HOUSING", "Housing, renting, neighbours", "-", ""),
    ("L-TECH", "Technology and the internet", "-", ""),
])
add("B1", "sound", [
    ("P-CONNECTED", "Connected speech, weak forms, contractions", "-", ""),
    ("P-NATIVE-SPEED", "Following native speed: what gets swallowed", "-", ""),
])
add("B1", "chunk", [
    ("C-IN-MY-OPINION", "In my opinion / I think that", "-", ""), ("C-I-AGREE", "I agree / exactly / you're right", "-", ""),
    ("C-SEE-POINT-BUT", "I see your point, but ___", "-", ""), ("C-THE-THING-IS", "The thing is, ___", "-", ""),
    ("C-WHAT-DO-YOU-THINK", "What do you think?", "-", ""), ("C-IF-I-WERE-YOU", "If I were you, I'd ___", "V", ""),
    ("C-TO-BE-HONEST", "To be honest, ___", "-", ""), ("C-IT-DEPENDS", "It depends (on ___)", "N", ""),
])

# ---------------- B2 ----------------
add("B2", "function", [
    ("F-ARGUE", "Argue a case with structured points", "-", ""),
    ("F-HEDGE", "Hedge: soften a claim, show uncertainty", "-", ""),
    ("F-CONCEDE", "Concede a point and then counter it", "-", ""),
    ("F-PERSUADE", "Persuade and reassure", "-", ""),
    ("F-SUMMARISE", "Summarise two sides and give a balanced view", "-", ""),
    ("F-SPECULATE", "Speculate about present and past", "-", ""),
    ("F-REGRET", "Express regret and hypothesise about the past", "-", ""),
    ("F-FORMAL-REQUEST", "Make a formal request or complaint in writing", "-", ""),
])
add("B2", "door", [
    ("D-IF-HAD-KNOWN", "If I had known, I would have ___", "CL", "Third conditional"),
    ("D-MUST-HAVE", "She must have ___ / can't have ___", "V", "Past deduction"),
    ("D-WILL-HAVE-DONE", "I'll have finished by ___", "V", "Future perfect"),
    ("D-WILL-BE-ING", "I'll be working at ___", "ING", "Future continuous"),
    ("D-HAD-BEEN-ING", "I had been ___-ing for ___", "ING", ""),
    ("D-HAVE-IT-DONE", "I had it fixed / got it done", "N", "Causative"),
    ("D-WISH-HAD", "I wish I had ___ / if only I had ___", "CL", ""),
    ("D-WOULD-HABIT", "When I was young, we would ___", "V", ""),
    ("D-REPORT-ING", "He denied / admitted / suggested ___-ing", "ING", ""),
    ("D-ADVISED-TO", "She advised me to ___ / warned me not to ___", "TO", ""),
    ("D-IS-SAID-TO", "It is said that ___ / he is thought to ___", "CL", ""),
    ("D-CLEFT", "What I want is ___ / It was X that ___", "CL", ""),
    ("D-INVERSION", "Not only did I ___, but ___", "V", ""),
    ("D-NEEDNT-HAVE", "You needn't have ___ / didn't need to ___", "V", ""),
])
add("B2", "turn", [
    ("T-FUT-PERF", "Future perfect (will have done)", "-", ""),
    ("T-FUT-PROG", "Future continuous (will be doing)", "-", ""),
    ("T-PAST-PERF-PROG", "Past perfect continuous (had been doing)", "-", ""),
    ("T-COND3", "Third conditional (if I had, I would have)", "-", ""),
    ("T-COND-MIXED", "Mixed conditionals", "-", ""),
    ("T-PASSIVE-ALL", "Passive in all tenses, get-passive", "-", ""),
])
add("B2", "glue", [
    ("G-HOWEVER", "however / nevertheless", "-", ""), ("G-DESPITE", "despite / in spite of", "-", ""),
    ("G-WHEREAS", "whereas / while (formal contrast)", "-", ""), ("G-OTHER-HAND", "on the one hand / on the other hand", "-", ""),
    ("G-UNLESS", "unless", "-", ""), ("G-AS-LONG-AS", "as long as / provided that", "-", ""),
    ("G-IN-CASE", "in case", "-", ""), ("G-WHOEVER", "whoever / whatever / wherever", "-", ""),
    ("G-NOT-ONLY", "not only ... but also", "-", ""), ("G-EVEN-IF", "even if", "-", ""),
])
add("B2", "slot", [
    ("S-ARTICLE-ABSTRACT", "Articles with abstract and generic nouns", "-", ""),
    ("S-DETERMINERS", "each / every / either / neither / both / all", "-", ""),
    ("S-COLLOCATION", "Verb-noun and adjective-noun collocations", "-", ""),
    ("S-PHRASAL", "Phrasal or particle verbs, separable prefixes", "-", ""),
])
add("B2", "lexicon", [
    ("L-ABSTRACT", "Abstract nouns and argument vocabulary", "-", ""),
    ("L-BUSINESS", "Work, business, negotiation", "-", ""),
    ("L-SOCIETY", "Politics, society, news", "-", ""),
    ("L-SCIENCE", "Science and technology", "-", ""),
    ("L-CULTURE", "Arts, culture, books, film", "-", ""),
])
add("B2", "sound", [
    ("P-ACCENTS", "Regional accents and varieties", "-", ""),
    ("P-ATTITUDE", "Intonation for attitude: doubt, sarcasm, enthusiasm", "-", ""),
])
add("B2", "chunk", [
    ("C-COULD-BE-ARGUED", "It could be argued that ___", "CL", ""), ("C-ADMITTEDLY", "Admittedly, ___ / Granted, ___", "-", ""),
    ("C-THAT-SAID", "That said, ___ / Having said that, ___", "-", ""), ("C-IN-SHORT", "In short / to sum up", "-", ""),
    ("C-TAKE-YOUR-POINT", "I take your point, but ___", "-", ""), ("C-WOULD-YOU-MIND", "Would you mind ___-ing?", "ING", ""),
    ("C-I-WONDER-IF", "I wonder if you could ___", "V", ""), ("C-ON-BALANCE", "On balance, ___", "-", ""),
])

# ---------------- C1 ----------------
add("C1", "function", [
    ("F-QUALIFY", "Qualify a claim precisely", "-", ""),
    ("F-REGISTER", "Shift register: the same thing formal, neutral, and casual", "-", ""),
    ("F-IRONY", "Understate, signal irony", "-", ""),
    ("F-CHAIR", "Chair a discussion: open, cut off, redirect, close", "-", ""),
    ("F-CRITIQUE", "Criticise diplomatically", "-", ""),
    ("F-NEGOTIATE", "Negotiate formally: conditions, consequences", "-", ""),
    ("F-EVALUATE", "Evaluate and weigh evidence", "-", ""),
])
add("C1", "door", [
    ("D-WOULD-HAVE-THOUGHT", "I would have thought that ___", "CL", "Hedged disagreement"),
    ("D-ARGUABLE", "It's arguable that ___ / there's a case for ___", "CL", ""),
    ("D-MIGHT-AS-WELL", "I might as well ___ / it may well ___", "V", ""),
    ("D-CLAIMS-TO-HAVE", "She claims to have ___ / seems to have ___", "V", "Perfect infinitive"),
    ("D-EMPHATIC", "I do think ___ / I did try ___", "V", "Emphatic form"),
    ("D-HAD-I-KNOWN", "Had I known, ___ / Were I to ___ / Should you need ___", "CL", "Inverted conditional"),
    ("D-SUBJUNCTIVE", "I insist that he ___ / it is vital that she ___", "V", "Subjunctive or its equivalent"),
    ("D-WAS-TO-HAVE", "I was to have ___ / was going to ___", "V", "Future in the past"),
    ("D-HAVING-DONE", "Having ___, I ___", "V", "Participle clause"),
    ("D-LITTLE-DID", "Little did I know ___ / Far from being ___", "CL", ""),
    ("D-SO-MUCH-FOR", "So much for ___ / Never mind ___", "N", ""),
    ("D-NO-SOONER", "No sooner had I ___ than ___ / Hardly had ___ when ___", "V", ""),
])
add("C1", "turn", [
    ("T-REGISTER", "Register pairs: formal versus informal forms of the same turn", "-", ""),
    ("T-PERF-INF", "Perfect infinitive (to have done)", "-", ""),
    ("T-INVERSION", "Inversion after negative adverbials", "-", ""),
    ("T-SUBJUNCTIVE", "Subjunctive mood, where it survives", "-", ""),
    ("T-FUT-IN-PAST", "Future in the past (was going to, would)", "-", ""),
])
add("C1", "glue", [
    ("G-NEVERTHELESS", "nevertheless / nonetheless", "-", ""), ("G-ALBEIT", "albeit", "-", ""),
    ("G-INSOFAR", "insofar as / to the extent that", "-", ""), ("G-GIVEN-THAT", "given that / in view of", "-", ""),
    ("G-NOTWITHSTANDING", "notwithstanding / regardless of", "-", ""), ("G-HENCE", "hence / thereby / thus", "-", ""),
    ("G-LEST", "lest / for fear that", "-", ""), ("G-PROVIDED", "provided that / on condition that", "-", ""),
])
add("C1", "slot", [
    ("S-NOMINALISATION", "Nominalisation (decide to decision, the fact that)", "-", ""),
    ("S-FORMAL-NP", "Formal noun phrases and pre-modification", "-", ""),
    ("S-ELLIPSIS", "Ellipsis and substitution (so do I, I hope not)", "-", ""),
    ("S-FRONTING", "Fronting and emphasis by word order", "-", ""),
])
add("C1", "lexicon", [
    ("L-IDIOM", "Idioms and fixed metaphors in daily use", "-", ""),
    ("L-REGISTER-PAIRS", "Register pairs: casual and formal words for the same thing", "-", ""),
    ("L-PRECISE", "Low-frequency precise words", "-", ""),
    ("L-HUMOUR", "Humour, irony, understatement", "-", ""),
    ("L-ACADEMIC", "Academic and professional discourse", "-", ""),
])
add("C1", "sound", [
    ("P-PROSODY", "Prosody for emphasis and contrast", "-", ""),
    ("P-IRONY-TONE", "The tone that marks irony", "-", ""),
])
add("C1", "chunk", [
    ("C-BE-THAT-AS-IT-MAY", "Be that as it may, ___", "-", ""), ("C-PUT-IT-MILDLY", "To put it mildly, ___", "-", ""),
    ("C-WITH-RESPECT", "With respect, ___ / With all due respect, ___", "-", ""), ("C-MOVE-ON", "Let's move on / Can we come back to that?", "-", ""),
    ("C-IF-I-MAY", "If I may, ___", "-", ""), ("C-CORRECT-ME", "Correct me if I'm wrong, but ___", "-", ""),
    ("C-ALL-THINGS", "All things considered, ___", "-", ""), ("C-FOR-WHAT-ITS-WORTH", "For what it's worth, ___", "-", ""),
])

# ---------------- Scenarios ----------------
# (id, level, situation, task, function, recipe ids, turn)
SC = [
    ("SC-A1-01", "A1", "You are at a language meetup. Someone asks who you are.", "Say your name, where you are from, and what you do.", "F-INTRO", ["C-MY-NAME", "D-BE", "G-AND", "D-BE"], "T-PRES"),
    ("SC-A1-02", "A1", "You are at a café counter.", "Order a coffee and a sandwich politely.", "F-WANT", ["D-WOULD-LIKE", "G-AND", "C-PLEASE-THANKS"], "T-PRES"),
    ("SC-A1-03", "A1", "You are lost near the centre of town.", "Ask where the station is, then ask how much a ticket costs.", "F-ASK-WAY", ["C-SORRY", "C-WHERE-IS", "C-HOW-MUCH"], "T-WH"),
    ("SC-A1-04", "A1", "A friend asks about food.", "Say one thing you like eating and one thing you don't.", "F-LIKE", ["D-LIKE", "G-BUT", "D-LIKE"], "T-NEG"),
    ("SC-A1-05", "A1", "A colleague asks about your weekend plans.", "Say what you are going to do and who with.", "F-WANT", ["D-GOING-TO", "G-WITH"], "T-FUT"),
    ("SC-A1-06", "A1", "Someone is speaking too fast.", "Say you don't understand and ask them to repeat more slowly.", "F-NOT-UNDERSTAND", ["C-SORRY", "C-DONT-UNDERSTAND", "C-REPEAT-PLEASE"], "T-PRES"),
    ("SC-A2-01", "A2", "A friend invites you to dinner on Friday. You have to work late.", "Decline politely and give the reason.", "F-ACCEPT-DECLINE", ["C-THANKS-BUT", "D-CAN", "G-BECAUSE", "D-HAVE-TO"], "T-NEG"),
    ("SC-A2-02", "A2", "You and a friend want to meet this week.", "Suggest a day, a time and a place, and ask if that works.", "F-SUGGEST", ["C-HOW-ABOUT", "G-AT", "D-LETS"], "T-Q"),
    ("SC-A2-03", "A2", "Monday morning, a colleague asks about your weekend.", "Say two things you did, in order.", "F-DESCRIBE-PAST", ["G-SEQUENCE", "D-HAVE-DONE", "G-BEFORE-AFTER"], "T-PAST"),
    ("SC-A2-04", "A2", "You arrive twenty minutes late to meet someone.", "Apologise and explain what happened.", "F-APOLOGISE", ["C-SORRY-LATE", "G-BECAUSE", "D-WAS-DOING"], "T-PAST-PROG"),
    ("SC-A2-05", "A2", "At the doctor with a bad cold. You have an important meeting tomorrow.", "Ask what you should do, and say you have to work tomorrow.", "F-ASK-REPEAT", ["D-SHOULD", "G-BUT", "D-HAVE-TO"], "T-Q"),
    ("SC-A2-06", "A2", "You are in a restaurant and don't know a word on the menu.", "Ask what it means, then order it and ask for the bill later.", "F-ORDER", ["C-WHAT-MEAN", "D-WOULD-LIKE", "C-BILL"], "T-Q"),
    ("SC-B1-01", "B1", "Your partner suggests a beach holiday. You would prefer the mountains.", "Say what you'd rather do, give a reason, and propose a compromise.", "F-ARRANGE", ["D-WOULD-RATHER", "G-BECAUSE", "C-HOW-ABOUT"], "T-COND2"),
    ("SC-B1-02", "B1", "A discussion about working from home.", "Give your opinion with one reason and one concession.", "F-OPINION", ["C-IN-MY-OPINION", "G-ALTHOUGH", "D-THINK-THAT"], "T-PRES"),
    ("SC-B1-03", "B1", "You missed your train this morning.", "Tell the story: what had happened before, and what you did next.", "F-NARRATE", ["G-WHEN", "D-HAD-DONE", "G-SO"], "T-PAST-PERF"),
    ("SC-B1-04", "B1", "Your hotel room is noisy and the wifi doesn't work.", "Complain politely and ask to change rooms.", "F-COMPLAIN", ["C-THE-THING-IS", "G-AND", "D-COULD"], "T-Q"),
    ("SC-B1-05", "B1", "A friend failed an exam because they didn't study.", "Say what they should have done and what you'd do in their place.", "F-ADVISE", ["D-SHOULD-HAVE", "C-IF-I-WERE-YOU"], "T-COND2"),
    ("SC-B1-06", "B1", "Your boss moved the deadline to Thursday and asked you to tell the team.", "Report what your boss said and what she asked you to do.", "F-REPORT", ["D-SAID-THAT", "G-AND", "D-TOLD-TO"], "T-REPORTED"),
    ("SC-B2-01", "B2", "A debate about a four-day working week.", "Argue for it, concede one drawback, then counter the drawback.", "F-ARGUE", ["C-ADMITTEDLY", "G-HOWEVER", "D-IF-I-WERE"], "T-COND2"),
    ("SC-B2-02", "B2", "A colleague didn't show up to an important meeting and isn't answering.", "Speculate about what must have happened and what might have happened.", "F-SPECULATE", ["D-MUST-HAVE", "G-OR", "D-COULD-HAVE"], "T-COND3"),
    ("SC-B2-03", "B2", "You turned down a job last year and now regret it.", "Say what you would have done if you had known, and what you wish.", "F-REGRET", ["D-IF-HAD-KNOWN", "D-WISH-HAD"], "T-COND3"),
    ("SC-B2-04", "B2", "The heating in your flat has been broken for a week.", "Write a formal request to the landlord to have it repaired, with a deadline.", "F-FORMAL-REQUEST", ["C-I-WONDER-IF", "D-HAVE-IT-DONE", "G-AS-LONG-AS"], "T-PASSIVE-ALL"),
    ("SC-B2-05", "B2", "A friend asks what you think about banning cars from city centres.", "Summarise both sides, then give your balanced view.", "F-SUMMARISE", ["G-OTHER-HAND", "G-WHEREAS", "C-ON-BALANCE"], "T-PRES"),
    ("SC-B2-06", "B2", "Someone asks about your goals.", "Say what you will have achieved by this time next year, and what you'll be doing then.", "F-PERSUADE", ["D-WILL-HAVE-DONE", "G-AND", "D-WILL-BE-ING"], "T-FUT-PERF"),
    ("SC-C1-01", "C1", "In a meeting, a senior colleague proposes a plan you think is flawed.", "Disagree diplomatically and suggest what you would have expected instead.", "F-CRITIQUE", ["C-WITH-RESPECT", "D-WOULD-HAVE-THOUGHT", "G-ALBEIT"], "T-REGISTER"),
    ("SC-C1-02", "C1", "You are chairing. Someone has gone off on a tangent.", "Cut them off politely, park the point, and return to the agenda.", "F-CHAIR", ["C-IF-I-MAY", "C-MOVE-ON", "G-GIVEN-THAT"], "T-REGISTER"),
    ("SC-C1-03", "C1", "A trip you had planned for months collapsed the day before.", "Describe it with some irony: what was to have happened and what you didn't know.", "F-IRONY", ["D-WAS-TO-HAVE", "D-LITTLE-DID", "D-SO-MUCH-FOR"], "T-FUT-IN-PAST"),
    ("SC-C1-04", "C1", "Someone claims AI will replace all translators within five years.", "Qualify the claim: to what extent it holds and where it fails.", "F-QUALIFY", ["D-ARGUABLE", "G-INSOFAR", "G-NEVERTHELESS"], "T-PRES"),
    ("SC-C1-05", "C1", "A supplier has delivered late twice.", "Insist formally that they deliver on time, on condition that otherwise the contract be reviewed.", "F-NEGOTIATE", ["D-SUBJUNCTIVE", "G-PROVIDED", "D-HAD-I-KNOWN"], "T-SUBJUNCTIVE"),
    ("SC-C1-06", "C1", "You finished a project and only then learned the requirements had changed.", "Tell it with a participle clause and an inverted opener.", "F-EVALUATE", ["D-HAVING-DONE", "D-NO-SOONER", "G-HENCE"], "T-INVERSION"),
]

ids = {i["id"] for i in I}
assert len(ids) == len(I), "duplicate ids"
scen = []
for sid, lvl, sit, task, fn, recipe, turn in SC:
    for r in recipe + [fn, turn]:
        assert r in ids, f"{sid}: unknown id {r}"
    scen.append({"id": sid, "level": lvl, "situation": sit, "task": task, "function": fn, "recipe": recipe, "turn": turn})

LANGS = [
    {"id": "khasi", "name": "Khasi", "native": "Ka Ktien Khasi", "script": "latin", "rtl": False, "translit": False, "variety": "Standard Khasi (Sohra/Cherrapunji dialect as used in writing and Shillong), Latin script"},
    {"id": "german", "name": "German", "native": "Deutsch", "script": "latin", "rtl": False, "translit": False, "variety": "Standard German (Germany), du and Sie both shown"},
    {"id": "hindi", "name": "Hindi", "native": "हिन्दी", "script": "devanagari", "rtl": False, "translit": True, "variety": "Standard spoken Hindi (Hindustani register used in daily speech), Devanagari with simple roman transliteration"},
    {"id": "french", "name": "French", "native": "Français", "script": "latin", "rtl": False, "translit": False, "variety": "Standard French (France), tu and vous both shown"},
    {"id": "swissgerman", "name": "Swiss German", "native": "Schwiizerdütsch", "script": "latin", "rtl": False, "translit": False, "variety": "Zürich German (Züritüütsch) in the common informal spelling used in messages; Bernese and Basel differences noted only where large"},
]

out = {
    "levels": LEVELS,
    "layers": [{"id": a, "name": b, "desc": c} for a, b, c in LAYERS],
    "languages": LANGS,
    "items": I,
    "scenarios": scen,
}
p = pathlib.Path(__file__).resolve().parent.parent / "data" / "framework.json"
p.write_text(json.dumps(out, ensure_ascii=False, indent=1))
from collections import Counter
print(f"wrote {p}: {len(I)} items, {len(scen)} scenarios")
print(Counter((i['level']) for i in I))
print(Counter((i['layer']) for i in I))
