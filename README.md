# wikitree-slippy-tree
A ''slippy'' tree for Wikitree. Drag to scroll, pinch to zoom.

## Features:
* Each node in the tree can be expanded up (ancestors) or expanded down (descendants). This leads to a multi-root tree.
* After a few of these operations the tree can be quite complex, so can be ''pruned'' to a single branch
* The confidence of parental links is shown by adjusting the width of the connecting lines.
* Drag scroll, pinch to zoom and touch-device friendly (not yet tested on Android, feedback welcome)
* Modern JS and CSS, with comments. No dependencies. Should be easy to reuse/repurpose.

## Tree layout
Laying out a multi-root tree is not a well-understood problem. After quite a few attempts, the approach I settled on was:
1. Identify a "focus" node. Do we group a person with their spouse or their siblings? A focus lets us decide. Start at the focus, assign it generation 0, then add their spouses (same generation), parents and siblings, then continue to expand outwards the same way. This gives us an ordered list of nodes and a generation for each node.
2. For each node in that order, identify its roots by traversing up the tree. Continue with every other node in the ordered list, adding any unseen roots.
3. For each root node in the root list, position the tree:
   * put the node in the appropriate column for its generation, separated from any previous node by an appropriate margin
   * add any spouses for that node that haven't already been positioned.
   * traverse down to do the same to children.
   * on the way up from traversing the children, if the mid-point of the children is lower than the current nodes positioned, move the current node down.
4. That gives us a valid layout with no overlaps - as a final step, use "force-positioning" algorithm to pull nodes up and down in their columns to make things look nicer.

This works well overall, with compromises when laying out multiple spouses and spouses-of-spouses. Suggestions for improvements welcome. 
