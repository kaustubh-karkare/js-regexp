
## A JavaScript Regular Expression Engine

This is a re-implementation of JavaScript's native RegExp object (most of it, at least), built purely as a learning exercise.

When a new `Pattern` object is created, a tree structure is built internally that represents the pattern. The tree contains various types of nodes each of which have different criteria for matching. When a string is to be matched, a `State` object is created and passed around as the tree is depth-first traversed.

In case there multiple ways to match and proceed at a particular node, information about the next alternative course of action is saved in the `State` object. In case of a subsequent mismatch, this information can be used to backtrack and resume matching, having made a different decision this time.