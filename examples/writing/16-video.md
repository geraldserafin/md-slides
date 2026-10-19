## Video

The same syntax, recognised by extension (`mp4` `webm` `ogv` `mov` `m4v`). Audio (`mp3` `ogg` `wav` `m4a`…) gives a player bar: `![](talk.mp3){autoplay}`.
A video can also be a slide's background: `background: clip.mp4` in the front matter.

![](clip.webm){autoplay loop muted}

<!-- autoplay implies muted (browsers block unmuted autoplay). controls=false hides the controls. -->

````markdown
![](clip.webm){autoplay loop muted}
![](talk.mp4){controls=false}
````
