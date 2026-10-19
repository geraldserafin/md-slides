## Animate one element

A line like `{anim=zoom delay=0.2}` right after an item (blank line between) sets how that item comes in.
Together with `+++` it is a build, like PowerPoint's entrance effects:

+++

Fades in on the first click, no movement.

{anim=fade}

+++

Zooms in from a smaller size.

{anim=zoom dur=0.7}

+++

Pops with a little overshoot, then leaves again on the fourth click.

{anim=pop out=4}

<!-- anim: fade | rise (default) | zoom | left | right | down | blur | pop | none. delay and dur are seconds; at=N sets the click, out=N the click where it disappears. -->
