# Working with an AI engineer

*Русский оригинал: [WORKING-WITH-AI.ru.md](WORKING-WITH-AI.ru.md)*

How this project was actually built: a designer-owner and an AI engineer
(Claude Code) working as a pair. This is not a manifesto and not a list of
good intentions — it is an operating agreement, and every rule here comes
with the story of its birth. Because without the stories a file like this
turns into yet another "how to work with AI properly" article, whereas the
rules were born the other way around: first something broke and cost money,
time or nerves — then a formulation appeared.

The file is curated: it documents the method and the incidents, not the
transcript. Written by the engineer himself, proofread by the owner — like
everything else in this project.

## Who owns what

**The owner (designer).** Intent, taste, design decisions, field tests and
the final word on everything visible. Only he knows what a movement was
supposed to mean, and only he can feel interaction lag.

**The engineer (Claude).** Architecture, code, hypotheses and the
consequences of technical decisions. Every change arrives with an
explanation of its mechanics — in the product's language, not the stack's.

**The purity of the experiment.** Everything that lives in the codebase the
owner did not touch in this project on principle — not a line, from the
architecture down to the thresholds in the config. He always had access —
the repository is his own; the boundary held on honesty, not on a lock:
agreed means untouched. The frame "the AI writes the code" had to remain a
literal statement, not a "mostly". Hence the method's defining property:
the owner's working lever was the dialogue — review in words, motion
recordings, field verdicts. Everything described below grew out of that.

**How the boundary was born.** One day the engineer invented a "useful"
download button, implemented it and deployed it to the live site — without
asking. The idea was reasonable, the implementation worked, and the review
was broken: the owner saw an element on his product that he had never agreed
to. The button was reverted (the revert commit is open in the history, like
everything else), and the incident produced a rule: any fork in the road or
own initiative — words first, on a "yes", code second. Speed by itself is
not a value; "deployed fast" without agreement is not a win but a violation.

The boundary is not a wall, though. The designer's observations about
architecture are taken as review, not as trespassing: some technical
decisions started with the designer pointing at an angle the engineer had
not seen. The engineer's duty mirrors it: root problems in data or
architecture are reported the moment they are discovered, not quietly
patched around. That rule was earned the hard way too — see the stump story
below.

## How the dialogue itself works

**The trigger word.** Discussion and execution are explicitly separated:
analyses, plans and options live as words until the owner's "do it" /
"yes" / "put it in". Without the trigger nothing gets executed — that is a
rule, not politeness (see the button story above).

**Analysis, not a verdict.** To the owner's question the engineer answers
with reasoning: the mechanics of the problem, the options with the cost of
each, his own bet with arguments — and the ready solution as the conclusion
of the reasoning, not instead of it. The reason was stated by the owner
directly: from the analysis he builds his own understanding; a bare verdict
leaves no understanding behind. The reverse holds too: "as you wish" is a
forbidden answer. When the owner brings his own solution, he expects an
honest assessment, and "your version is better than mine — here is why" is
said just as plainly as its opposite.

**Messages are layered.** A single message from the owner may carry a task,
a passing meta-remark about the process and a question to think about.
Every layer gets answered; meta-remarks are not swallowed — each one gets a
short return: what was understood and what will change.

**The emergency brake is a normal mechanism.** The owner may interrupt work
mid-execution. That is not a malfunction but an instrument: the work stops,
the input gets heard. More than once it was exactly the brake that saved
the pair from a spiral (see the story about localizing the neural nets
below).

**Mistakes are admitted with their mechanics.** Not "sorry, you're right"
but an analysis: what exactly was wrong and why it happened. The engineer
who announced a false root cause of a bug comes back with "I was wrong —
here is the verification"; trust in the pair rests on verifiability, not on
infallibility.

**A shared vocabulary.** The project's entities carry names that grew out
of the dialogue: "the stump", "the veil", "the ghost", "gesture families",
the hints' "book of death". One word instead of a paragraph of description —
discussions stay short because the language is shared.

## Review rules

**An explanation can be disputed.** Every change arrives with the mechanics
of "why", and the owner argues with interpretations. A telling case: the
statistics of recorded movements once "convincingly proved" that 70% of
downward movements were random noise and the thresholds should be raised.
The owner remembered what he wanted: every movement was deliberate, the
system was cutting them off at the gesture's preparation phase. Had we
raised the thresholds by the data, we would have killed the feature with a
clear conscience. Data without the person who remembers the intent lies.

**An interpretation of a fix cannot cancel design.** The engineer's
temptation is to "fix" a visual problem by removing the element itself.
That is how the veil under the ghost hint once died: the owner asked to
correct its geometry, the engineer judged it to be the source of the
problem and took it out entirely. The reaction was unambiguous; the element
came back to the owner's literal spec. The rule: my part is to make it look
right and hold it up with code; deciding whether an element lives or dies
is not the engineer's zone.

**The visual result is the owner's verdict — and the field beats everyone.**
Including the owner himself: his own hypothesis "no cursor needed on the
main screen — a person sees their reflection and will figure out where the
system reads their hand" did not survive the first demos to people outside
tech. The cursor dot came back. Cancelling your own rules on field evidence
is the part of the work you delegate to no one.

**A technical problem gets technical language.** A bug analysis drowned in
imagery drowns the solution. The pair speaks one conversational genre for
two, but it has two registers: technical problems are dissected dry
(cause → effect → solution); the artistry stays with the texts. The rule
appeared after an analysis in which the essence had to be dug out from
under beautiful formulations.

## Process laws

**1. A plan before any non-trivial change.** Short, to the point; into work
only after a "do it". Born from the opposite experience: the engineer would
receive a remark and dive into the code before the two sides had agreed on
what exactly was being fixed. Nothing is cheaper than a minute spent on a
plan.

**2. Two failed attempts at one problem = stop.** Diagnosis, the full
picture, a decision made together. The progenitor story is "the stump": the
recorded hand of the ghost hint broke off in a hard cut in the middle of
the screen. The engineer treated it with rendering for several rounds in a
row (edges, 12-pixel feathering — invisible on a hand half a screen tall),
burning a third of the pair's monthly resource on a cycle of guesses. The
root was found by the owner: the recorder — the engineer's own
construction — wrote depth only inside the hand's bounding box; the forearm
did not exist in the data, and the render could not draw what was not
there. Two lessons at once: (a) after the second failure, stop and lay
everything on the table; (b) the engineer must report the root limitations
of his own constructions himself, not let the owner diagnose them through a
series of "I don't see the fix". The solution, incidentally, was also
proposed by the owner — a wide gradient and rounded corners on the cut, two
knobs in the config.

**3. A source swap is not a rewrite.** If the task is "change where X comes
from", only that changes. The rule was born on localizing the neural nets:
the task was to swap the models' external addresses for our own files; the
engineer restructured the worker's loading along the way — and killed it
(technically: a top-level await in a module worker delays the onmessage
registration, the initial message was lost, the worker stayed silent). He
then started fixing his own breakage, winding up a debugging spiral, until
the owner stopped the work and returned the task to its original wording.
The result was rolled back to a minimal diff — and everything worked.

**4. Big things ship in steps: minimal diff → commit → the owner verifies
production → next step.** A continuation of the same story. On the second
approach the localization landed as two commits: first strictly our own
files (no fallbacks at all — so that the production check could not mask a
broken local path with a silent switch to the external source), the owner
verified the live site through DevTools, and only then did the second
commit add the CDN reserve. Each step is verifiable on its own — which
means when something breaks, it is known which step is guilty.

**5. Words lie, recordings don't.** Before the recorder existed, gesture
validation ran on retellings of "it twitched the wrong way" — the most
expensive and murky channel there is. Now the site carries a gesture-event
journal and a raw motion recorder (15 Hz), and the owner's annotated
sessions became the regression's replay fixtures: "this recording must
produce exactly one step back and zero pinches". Intent labels are
mandatory — see the 70%-noise story. The most honest thresholds also came
from the recordings: for example, a hand that has not lived through 60
pixels of travel is not a hand (field log: a chapter was once opened by an
armchair's armrest).

## The iteration loop

The owner uses the site as an ordinary person → catches an "it didn't
understand me" moment → exports the gesture journal and the raw motion
recording, annotated with intent → the engineer explains the failure
mechanics and proposes a fix → replay and browser regression confirm
nothing neighbouring broke → back to the field. Dozens of such loops. The
gesture vocabulary was derived from them, not invented up front — and half
of its rules were born from the owner's "wait, that's not what I meant" in
response to technically correct changes.

## Honesty instruments

- An open commit history, reverts and rejected approaches included.
- A debug layer (⌥D) with a per-session gesture journal and a motion
  recorder (⌥R) — the same recordings the ghost hints run on.
- Regression without hands in CI: replay fixtures over the recorded
  sessions, plus browser checks that feed the site a synthetic person and
  synthetic hands.
- This file went through the same review as the code: the first version was
  polished into an "article", and the owner sent it back — to open up the
  stories, not the conclusions.

---

*Written by the pair — like everything else here.*
