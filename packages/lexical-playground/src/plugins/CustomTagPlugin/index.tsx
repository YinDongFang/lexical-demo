/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type {JSX} from 'react';

import './index.css';

import {
  $createCustomTagNode,
  $isCustomTagNode,
  CustomTagNode,
} from '../../nodes/CustomTagNode';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {$findMatchingParent, mergeRegister} from '@lexical/utils';
import {
  $getSelection,
  $isLineBreakNode,
  $isRangeSelection,
  $normalizeSelection__EXPERIMENTAL,
  $isElementNode,
  $setSelection,
  BaseSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_LOW,
  getDOMSelection,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  SELECTION_CHANGE_COMMAND,
  Point,
} from 'lexical';
import {Dispatch, useCallback, useEffect, useRef, useState} from 'react';
import * as React from 'react';
import {createPortal} from 'react-dom';

import {getSelectedNode} from '../../utils/getSelectedNode';

function setFloatingElemPositionForLinkEditor(
  targetRect: DOMRect | null,
  floatingElem: HTMLElement,
  anchorElem: HTMLElement,
  verticalGap: number = 10,
  horizontalOffset: number = 5,
): void {
  const scrollerElem = anchorElem.parentElement;

  if (targetRect === null || !scrollerElem) {
    floatingElem.style.opacity = '0';
    floatingElem.style.transform = 'translate(-10000px, -10000px)';
    return;
  }

  const floatingElemRect = floatingElem.getBoundingClientRect();
  const anchorElementRect = anchorElem.getBoundingClientRect();
  const editorScrollerRect = scrollerElem.getBoundingClientRect();

  let top = targetRect.top - verticalGap;
  let left = targetRect.left - horizontalOffset;

  if (top < editorScrollerRect.top) {
    top += floatingElemRect.height + targetRect.height + verticalGap * 2;
  }

  if (left + floatingElemRect.width > editorScrollerRect.right) {
    left = editorScrollerRect.right - floatingElemRect.width - horizontalOffset;
  }

  top -= anchorElementRect.top;
  left -= anchorElementRect.left;

  floatingElem.style.opacity = '1';
  floatingElem.style.transform = `translate(${left}px, ${top}px)`;
}

function $getAncestor<NodeType extends LexicalNode = LexicalNode>(
  node: LexicalNode,
  predicate: (ancestor: LexicalNode) => ancestor is NodeType,
) {
  let parent = node;
  while (parent !== null && parent.getParent() !== null && !predicate(parent)) {
    parent = parent.getParentOrThrow();
  }
  return predicate(parent) ? parent : null;
}

function preventDefault(
  event: React.KeyboardEvent<HTMLInputElement> | React.MouseEvent<HTMLElement>,
): void {
  event.preventDefault();
}

function invariant(
  cond?: boolean,
  message?: string,
  ...args: string[]
): asserts cond {
  if (cond) {
    return;
  }

  throw new Error(
    'Internal Lexical error: invariant() is meant to be replaced at compile ' +
      'time. There is no runtime version. Error: ' +
      message,
  );
}

function $getPointNode(point: Point, offset: number): LexicalNode | null {
  if (point.type === 'element') {
    const node = point.getNode();
    invariant(
      $isElementNode(node),
      '$getPointNode: element point is not an ElementNode',
    );
    const childNode = node.getChildren()[point.offset + offset];
    return childNode || null;
  }
  return null;
}

function $withSelectedNodes<T>($fn: () => T): T {
  const initialSelection = $getSelection();
  if (!$isRangeSelection(initialSelection)) {
    return $fn();
  }
  const normalized = $normalizeSelection__EXPERIMENTAL(initialSelection);
  const isBackwards = normalized.isBackward();
  const anchorNode = $getPointNode(normalized.anchor, isBackwards ? -1 : 0);
  const focusNode = $getPointNode(normalized.focus, isBackwards ? 0 : -1);
  const rval = $fn();
  if (anchorNode || focusNode) {
    const updatedSelection = $getSelection();
    if ($isRangeSelection(updatedSelection)) {
      const finalSelection = updatedSelection.clone();
      if (anchorNode) {
        const anchorParent = anchorNode.getParent();
        if (anchorParent) {
          finalSelection.anchor.set(
            anchorParent.getKey(),
            anchorNode.getIndexWithinParent() + (isBackwards ? 1 : 0),
            'element',
          );
        }
      }
      if (focusNode) {
        const focusParent = focusNode.getParent();
        if (focusParent) {
          finalSelection.focus.set(
            focusParent.getKey(),
            focusNode.getIndexWithinParent() + (isBackwards ? 0 : 1),
            'element',
          );
        }
      }
      $setSelection($normalizeSelection__EXPERIMENTAL(finalSelection));
    }
  }
  return rval;
}
function FloatingLinkEditor({
  editor,
  isCustomNode,
  setisCustomNode,
  anchorElem,
  isEditMode,
  setIsEditMode,
}: {
  editor: LexicalEditor;
  isCustomNode: boolean;
  setisCustomNode: Dispatch<boolean>;
  anchorElem: HTMLElement;
  isEditMode: boolean;
  setIsEditMode: (v: boolean) => void;
}): JSX.Element {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [tagName, setTagName] = useState('');
  const [editedTagName, setEditedTagName] = useState('');
  const [lastSelection, setLastSelection] = useState<BaseSelection | null>(
    null,
  );

  const $updateLinkEditor = useCallback(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      const node = getSelectedNode(selection);
      const linkParent = $findMatchingParent(node, $isCustomTagNode);

      if (linkParent) {
        setTagName(linkParent.getTag());
      } else {
        setTagName('');
      }
    }
    const editorElem = editorRef.current;
    const nativeSelection = getDOMSelection(editor._window);
    const activeElement = document.activeElement;

    if (editorElem === null) {
      return;
    }

    const rootElement = editor.getRootElement();

    if (
      selection !== null &&
      nativeSelection !== null &&
      rootElement !== null &&
      rootElement.contains(nativeSelection.anchorNode) &&
      editor.isEditable()
    ) {
      const domRect: DOMRect | undefined =
        nativeSelection.focusNode?.parentElement?.getBoundingClientRect();
      if (domRect) {
        domRect.y += 40;
        setFloatingElemPositionForLinkEditor(domRect, editorElem, anchorElem);
      }
      setLastSelection(selection);
    } else if (!activeElement) {
      if (rootElement !== null) {
        setFloatingElemPositionForLinkEditor(null, editorElem, anchorElem);
      }
      setLastSelection(null);
    }

    return true;
  }, [anchorElem, editor, tagName]);

  useEffect(() => {
    const scrollerElem = anchorElem.parentElement;

    const update = () => {
      editor.getEditorState().read(() => {
        $updateLinkEditor();
      });
    };

    window.addEventListener('resize', update);

    if (scrollerElem) {
      scrollerElem.addEventListener('scroll', update);
    }

    return () => {
      window.removeEventListener('resize', update);

      if (scrollerElem) {
        scrollerElem.removeEventListener('scroll', update);
      }
    };
  }, [anchorElem.parentElement, editor, $updateLinkEditor]);

  useEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(({editorState}) => {
        editorState.read(() => {
          $updateLinkEditor();
        });
      }),

      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          $updateLinkEditor();
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [editor, $updateLinkEditor, setisCustomNode, isCustomNode]);

  useEffect(() => {
    editor.getEditorState().read(() => {
      $updateLinkEditor();
    });
  }, [editor, $updateLinkEditor]);

  const handleLinkSubmission = (
    event:
      | React.KeyboardEvent<HTMLInputElement>
      | React.MouseEvent<HTMLElement>,
  ) => {
    event.preventDefault();
    if (lastSelection === null) return;
    editor.update(() => {
      const selection = $getSelection();
      setIsEditMode(false);

      if (!$isRangeSelection(selection)) {
        return;
      }
      const nodes = selection.extract();

      console.log(nodes);

      if (editedTagName === '') {
        // Remove LinkNodes
        nodes.forEach((node) => {
          const parentLink = $findMatchingParent(node, $isCustomTagNode);
          if (parentLink) {
            const children = parentLink.getChildren();
            for (let i = 0; i < children.length; i++) {
              parentLink.insertBefore(children[i]);
            }
            parentLink.remove();
          }
        });
        return;
      }
      const updatedNodes = new Set<NodeKey>();
      const updateLinkNode = (linkNode: CustomTagNode) => {
        if (updatedNodes.has(linkNode.getKey())) {
          return;
        }
        updatedNodes.add(linkNode.getKey());
        linkNode.setTag(editedTagName);
      };
      // Add or merge LinkNodes
      if (nodes.length === 1) {
        const firstNode = nodes[0];
        // if the first node is a LinkNode or if its
        // parent is a LinkNode, we update the URL, target and rel.
        const linkNode = $getAncestor(firstNode, $isCustomTagNode);
        if (linkNode !== null) {
          return updateLinkNode(linkNode);
        }
      }

      $withSelectedNodes(() => {
        let linkNode: CustomTagNode | null = null;
        for (const node of nodes) {
          if (!node.isAttached()) {
            continue;
          }
          const parentLinkNode = $getAncestor(node, $isCustomTagNode);
          if (parentLinkNode) {
            updateLinkNode(parentLinkNode);
            continue;
          }
          if ($isElementNode(node)) {
            if (!node.isInline()) {
              // Ignore block nodes, if there are any children we will see them
              // later and wrap in a new LinkNode
              continue;
            }
            if ($isCustomTagNode(node)) {
              // If it's not an autolink node and we don't already have a LinkNode
              // in this block then we can update it and re-use it
              updateLinkNode(node);
              linkNode = node;
              continue;
            }
          }
          linkNode = $createCustomTagNode(editedTagName);
          node.insertAfter(linkNode);
          linkNode.append(node);
        }
      });
    });
  };

  return (
    <div ref={editorRef} className="custom-tag-editor">
      {(isCustomNode || isEditMode) && (
        <>
          <input
            className="custom-input"
            ref={inputRef}
            value={editedTagName}
            onChange={(event) => {
              setEditedTagName(event.target.value);
            }}
          />
          <button
            role="button"
            tabIndex={0}
            onMouseDown={preventDefault}
            onClick={handleLinkSubmission}>
            确认
          </button>
        </>
      )}
    </div>
  );
}

function useFloatingLinkEditorToolbar(
  editor: LexicalEditor,
  anchorElem: HTMLElement,
  isEditMode: boolean,
  setIsEditMode: (v: boolean) => void,
): JSX.Element | null {
  const [activeEditor, setActiveEditor] = useState(editor);
  const [isCustomNode, setIsCustomNode] = useState(false);

  useEffect(() => {
    function $updateToolbar() {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        const focusNode = getSelectedNode(selection);
        const focusLinkNode = $findMatchingParent(focusNode, $isCustomTagNode);
        if (!focusLinkNode) {
          setIsCustomNode(false);
          return;
        }
      }
    }
    return mergeRegister(
      editor.registerUpdateListener(({editorState}) => {
        editorState.read(() => {
          $updateToolbar();
        });
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        (_payload, newEditor) => {
          $updateToolbar();
          setActiveEditor(newEditor);
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
    );
  }, [editor]);

  return createPortal(
    <FloatingLinkEditor
      editor={activeEditor}
      isCustomNode={isCustomNode}
      anchorElem={anchorElem}
      isEditMode={isEditMode}
      setIsEditMode={setIsEditMode}
      setisCustomNode={setIsCustomNode}
    />,
    anchorElem,
  );
}

export default function CustomTagPlugin({
  anchorElem = document.body,
  isEditMode,
  setIsEditMode,
}: {
  anchorElem?: HTMLElement;
  isEditMode: boolean;
  setIsEditMode: (v: boolean) => void;
}): JSX.Element | null {
  const [editor] = useLexicalComposerContext();
  return useFloatingLinkEditorToolbar(
    editor,
    anchorElem,
    isEditMode,
    setIsEditMode,
  );
}
