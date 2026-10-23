# PickupPass scope

## Product

PickupPass is a front-desk workflow for childcare, school, and care teams. When a Ring arrival event occurs, staff verify the visitor against the authorized pickup roster and a one-time claim code before releasing a child.

## The one sharp demo

Ring event → staff selects claimed identity → secure code matches roster → release is approved and audit-logged. A wrong code produces an explicit do-not-release decision; staff can escalate to a guardian.

## Primary customer

The site coordinator or front-desk worker who must make quick, defensible handoff decisions while supervising a busy entrance.

## Deliberate cuts

- No facial recognition: it creates privacy and false-positive risk and is not needed for the core workflow.
- No smart-lock control: the product decides and records; it does not physically unlock a door.
- No multi-site administration: one site is enough to prove the workflow.
- No public Bee or Alexa integration in the first slice: Ring is the primary track and must remain unmistakable.
