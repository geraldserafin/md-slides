(tag_name) @tag
(attribute_name) @attribute
(attribute_value) @string
(quoted_attribute_value) @string
(entity) @constant.character.escape
"<" @punctuation.bracket
">" @punctuation.bracket
"</" @punctuation.bracket
"/>" @punctuation.bracket
"=" @operator

; raw content that is not injected with a language
(raw_element
  (raw_start_tag (tag_name) @_t)
  (raw_text) @string.special
  (#any-of? @_t "c" "chart" "diagram"))
(raw_element
  (raw_start_tag (tag_name) @_t)
  (raw_text) @comment
  (#eq? @_t "notes"))
(raw_element
  (raw_start_tag (tag_name) @_t)
  (raw_text) @variable.parameter
  (#eq? @_t "slide"))
