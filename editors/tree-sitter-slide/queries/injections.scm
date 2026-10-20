; the code inside <code lang=…> (and its <frame>s) is highlighted as that language; <tex> as LaTeX

; typescript
((raw_element
   (raw_start_tag (tag_name) @_t (attribute (attribute_name) @_a (attribute_value) @_v))
   (raw_text) @injection.content)
 (#eq? @_t "code") (#eq? @_a "lang") (#any-of? @_v "ts" "typescript")
 (#set! injection.language "typescript"))
((raw_element
   (raw_start_tag (tag_name) @_t (attribute (attribute_name) @_a (attribute_value) @_v))
   (raw_element (raw_start_tag (tag_name) @_f) (raw_text) @injection.content))
 (#eq? @_t "code") (#eq? @_f "frame") (#eq? @_a "lang") (#any-of? @_v "ts" "typescript")
 (#set! injection.language "typescript"))

; tsx
((raw_element
   (raw_start_tag (tag_name) @_t (attribute (attribute_name) @_a (attribute_value) @_v))
   (raw_text) @injection.content)
 (#eq? @_t "code") (#eq? @_a "lang") (#any-of? @_v "tsx")
 (#set! injection.language "tsx"))
((raw_element
   (raw_start_tag (tag_name) @_t (attribute (attribute_name) @_a (attribute_value) @_v))
   (raw_element (raw_start_tag (tag_name) @_f) (raw_text) @injection.content))
 (#eq? @_t "code") (#eq? @_f "frame") (#eq? @_a "lang") (#any-of? @_v "tsx")
 (#set! injection.language "tsx"))

; javascript
((raw_element
   (raw_start_tag (tag_name) @_t (attribute (attribute_name) @_a (attribute_value) @_v))
   (raw_text) @injection.content)
 (#eq? @_t "code") (#eq? @_a "lang") (#any-of? @_v "js" "javascript" "jsx")
 (#set! injection.language "javascript"))
((raw_element
   (raw_start_tag (tag_name) @_t (attribute (attribute_name) @_a (attribute_value) @_v))
   (raw_element (raw_start_tag (tag_name) @_f) (raw_text) @injection.content))
 (#eq? @_t "code") (#eq? @_f "frame") (#eq? @_a "lang") (#any-of? @_v "js" "javascript" "jsx")
 (#set! injection.language "javascript"))

; cpp
((raw_element
   (raw_start_tag (tag_name) @_t (attribute (attribute_name) @_a (attribute_value) @_v))
   (raw_text) @injection.content)
 (#eq? @_t "code") (#eq? @_a "lang") (#any-of? @_v "cpp" "c++" "cxx" "cc" "hpp")
 (#set! injection.language "cpp"))
((raw_element
   (raw_start_tag (tag_name) @_t (attribute (attribute_name) @_a (attribute_value) @_v))
   (raw_element (raw_start_tag (tag_name) @_f) (raw_text) @injection.content))
 (#eq? @_t "code") (#eq? @_f "frame") (#eq? @_a "lang") (#any-of? @_v "cpp" "c++" "cxx" "cc" "hpp")
 (#set! injection.language "cpp"))

; c
((raw_element
   (raw_start_tag (tag_name) @_t (attribute (attribute_name) @_a (attribute_value) @_v))
   (raw_text) @injection.content)
 (#eq? @_t "code") (#eq? @_a "lang") (#any-of? @_v "c" "h")
 (#set! injection.language "c"))
((raw_element
   (raw_start_tag (tag_name) @_t (attribute (attribute_name) @_a (attribute_value) @_v))
   (raw_element (raw_start_tag (tag_name) @_f) (raw_text) @injection.content))
 (#eq? @_t "code") (#eq? @_f "frame") (#eq? @_a "lang") (#any-of? @_v "c" "h")
 (#set! injection.language "c"))

; python
((raw_element
   (raw_start_tag (tag_name) @_t (attribute (attribute_name) @_a (attribute_value) @_v))
   (raw_text) @injection.content)
 (#eq? @_t "code") (#eq? @_a "lang") (#any-of? @_v "py" "python")
 (#set! injection.language "python"))
((raw_element
   (raw_start_tag (tag_name) @_t (attribute (attribute_name) @_a (attribute_value) @_v))
   (raw_element (raw_start_tag (tag_name) @_f) (raw_text) @injection.content))
 (#eq? @_t "code") (#eq? @_f "frame") (#eq? @_a "lang") (#any-of? @_v "py" "python")
 (#set! injection.language "python"))

; rust
((raw_element
   (raw_start_tag (tag_name) @_t (attribute (attribute_name) @_a (attribute_value) @_v))
   (raw_text) @injection.content)
 (#eq? @_t "code") (#eq? @_a "lang") (#any-of? @_v "rs" "rust")
 (#set! injection.language "rust"))
((raw_element
   (raw_start_tag (tag_name) @_t (attribute (attribute_name) @_a (attribute_value) @_v))
   (raw_element (raw_start_tag (tag_name) @_f) (raw_text) @injection.content))
 (#eq? @_t "code") (#eq? @_f "frame") (#eq? @_a "lang") (#any-of? @_v "rs" "rust")
 (#set! injection.language "rust"))

; go
((raw_element
   (raw_start_tag (tag_name) @_t (attribute (attribute_name) @_a (attribute_value) @_v))
   (raw_text) @injection.content)
 (#eq? @_t "code") (#eq? @_a "lang") (#any-of? @_v "go" "golang")
 (#set! injection.language "go"))
((raw_element
   (raw_start_tag (tag_name) @_t (attribute (attribute_name) @_a (attribute_value) @_v))
   (raw_element (raw_start_tag (tag_name) @_f) (raw_text) @injection.content))
 (#eq? @_t "code") (#eq? @_f "frame") (#eq? @_a "lang") (#any-of? @_v "go" "golang")
 (#set! injection.language "go"))

; java
((raw_element
   (raw_start_tag (tag_name) @_t (attribute (attribute_name) @_a (attribute_value) @_v))
   (raw_text) @injection.content)
 (#eq? @_t "code") (#eq? @_a "lang") (#any-of? @_v "java")
 (#set! injection.language "java"))
((raw_element
   (raw_start_tag (tag_name) @_t (attribute (attribute_name) @_a (attribute_value) @_v))
   (raw_element (raw_start_tag (tag_name) @_f) (raw_text) @injection.content))
 (#eq? @_t "code") (#eq? @_f "frame") (#eq? @_a "lang") (#any-of? @_v "java")
 (#set! injection.language "java"))

; bash
((raw_element
   (raw_start_tag (tag_name) @_t (attribute (attribute_name) @_a (attribute_value) @_v))
   (raw_text) @injection.content)
 (#eq? @_t "code") (#eq? @_a "lang") (#any-of? @_v "sh" "bash" "shell")
 (#set! injection.language "bash"))
((raw_element
   (raw_start_tag (tag_name) @_t (attribute (attribute_name) @_a (attribute_value) @_v))
   (raw_element (raw_start_tag (tag_name) @_f) (raw_text) @injection.content))
 (#eq? @_t "code") (#eq? @_f "frame") (#eq? @_a "lang") (#any-of? @_v "sh" "bash" "shell")
 (#set! injection.language "bash"))

; json
((raw_element
   (raw_start_tag (tag_name) @_t (attribute (attribute_name) @_a (attribute_value) @_v))
   (raw_text) @injection.content)
 (#eq? @_t "code") (#eq? @_a "lang") (#any-of? @_v "json")
 (#set! injection.language "json"))
((raw_element
   (raw_start_tag (tag_name) @_t (attribute (attribute_name) @_a (attribute_value) @_v))
   (raw_element (raw_start_tag (tag_name) @_f) (raw_text) @injection.content))
 (#eq? @_t "code") (#eq? @_f "frame") (#eq? @_a "lang") (#any-of? @_v "json")
 (#set! injection.language "json"))

; html
((raw_element
   (raw_start_tag (tag_name) @_t (attribute (attribute_name) @_a (attribute_value) @_v))
   (raw_text) @injection.content)
 (#eq? @_t "code") (#eq? @_a "lang") (#any-of? @_v "html")
 (#set! injection.language "html"))
((raw_element
   (raw_start_tag (tag_name) @_t (attribute (attribute_name) @_a (attribute_value) @_v))
   (raw_element (raw_start_tag (tag_name) @_f) (raw_text) @injection.content))
 (#eq? @_t "code") (#eq? @_f "frame") (#eq? @_a "lang") (#any-of? @_v "html")
 (#set! injection.language "html"))

; css
((raw_element
   (raw_start_tag (tag_name) @_t (attribute (attribute_name) @_a (attribute_value) @_v))
   (raw_text) @injection.content)
 (#eq? @_t "code") (#eq? @_a "lang") (#any-of? @_v "css")
 (#set! injection.language "css"))
((raw_element
   (raw_start_tag (tag_name) @_t (attribute (attribute_name) @_a (attribute_value) @_v))
   (raw_element (raw_start_tag (tag_name) @_f) (raw_text) @injection.content))
 (#eq? @_t "code") (#eq? @_f "frame") (#eq? @_a "lang") (#any-of? @_v "css")
 (#set! injection.language "css"))

; lua
((raw_element
   (raw_start_tag (tag_name) @_t (attribute (attribute_name) @_a (attribute_value) @_v))
   (raw_text) @injection.content)
 (#eq? @_t "code") (#eq? @_a "lang") (#any-of? @_v "lua")
 (#set! injection.language "lua"))
((raw_element
   (raw_start_tag (tag_name) @_t (attribute (attribute_name) @_a (attribute_value) @_v))
   (raw_element (raw_start_tag (tag_name) @_f) (raw_text) @injection.content))
 (#eq? @_t "code") (#eq? @_f "frame") (#eq? @_a "lang") (#any-of? @_v "lua")
 (#set! injection.language "lua"))

((raw_element (raw_start_tag (tag_name) @_t) (raw_text) @injection.content)
 (#eq? @_t "tex")
 (#set! injection.language "latex"))
