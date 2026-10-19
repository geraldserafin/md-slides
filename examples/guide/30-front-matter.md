## Slide front matter

An optional block at the top of a slide. Every key applies to that slide only.

````text
---
layout: side            side | side-right | cover
theme: light            built-in or custom theme name
background: bg.jpg      image path/URL or any CSS value
valign: center          force vertical centering
class: spotlight        extra CSS class on the stage
title: Short title      shown in the presenter view
transition: slide       fade | slide | slide-left | zoom | none
stagger: 0.12           seconds between text blocks
align: justify          left | center | right | justify
heading-align: left     left | center | right
heading-size: 56        px or any CSS length (also: text-size, spacing, padding, split)
accent: #ff9e64         also heading-color, text-color
footer: off             hide the deck's footer/header on this slide
--accent: #ff9e64       any CSS variable
---
````

<!-- The next slides demonstrate theme, background, class/valign and transitions. -->
