" Vim syntax for .slide files (slideit): tags, attributes, raw blocks, and the code inside <code lang=...>
if exists('b:current_syntax') | finish | endif

syntax match slideEntity /&\(#\d\+\|#x\x\+\|\w\+\);/
syntax match slideEscape /\\<\/\w\+>/

syntax region slideTag matchgroup=slideDelim start=/<\/\?\a[a-z0-9-]*/ end=/\/\?>/ contains=slideAttr,slideString,slideEq
syntax match slideAttr /\<[a-z][a-z0-9-]*\>/ contained
syntax match slideEq /=/ contained
syntax region slideString start=/"/ end=/"/ contained
syntax region slideString start=/'/ end=/'/ contained

" raw blocks
syntax region slideNotes matchgroup=slideDelim start=/<notes>/ end=/<\/notes>/ contains=slideEscape
syntax region slideInline matchgroup=slideDelim start=/<c>/ end=/<\/c>/ contains=slideEscape
syntax region slideMath matchgroup=slideDelim start=/<tex>/ end=/<\/tex>/
syntax region slideSettings matchgroup=slideDelim start=/<slide>/ end=/<\/slide>/ contains=slideKey,slideComment
syntax match slideKey /^\s*[a-z-]\+\s*:/ contained
syntax match slideComment /#.*$/ contained
syntax region slideCode matchgroup=slideDelim start=/<code\s[^>]*>/ end=/<\/code>/ contains=slideFrame,slideEscape
syntax region slideFrame matchgroup=slideDelim start=/<frame[^>]*>/ end=/<\/frame>/ contained contains=slideEscape

highlight default link slideDelim Delimiter
highlight default link slideTag Function
highlight default link slideAttr Identifier
highlight default link slideEq Operator
highlight default link slideString String
highlight default link slideEntity SpecialChar
highlight default link slideEscape SpecialChar
highlight default link slideNotes Comment
highlight default link slideInline String
highlight default link slideMath Special
highlight default link slideKey Identifier
highlight default link slideComment Comment
highlight default link slideCode Normal

let b:current_syntax = 'slide'
