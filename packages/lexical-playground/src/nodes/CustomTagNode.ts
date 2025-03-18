/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import {
  $applyNodeReplacement,
  ElementNode,
  LexicalNode,
  type NodeKey,
  type SerializedElementNode,
  type Spread,
} from 'lexical';

export type SerializedCustomTagNode = Spread<
  {
    tagName: string;
  },
  SerializedElementNode
>;

export class CustomTagNode extends ElementNode {
  __tag: string;

  static getType(): string {
    return 'custom-tag';
  }

  constructor(tagName: string, key?: NodeKey) {
    super(key);
    this.__tag = tagName;
  }

  static clone(node: CustomTagNode): CustomTagNode {
    return new CustomTagNode(node.__tag, node.__key);
  }

  setTag(tag: string): this {
    const writable = this.getWritable();
    writable.__tag = tag;
    return writable;
  }

  getTag(): string {
    return this.__tag;
  }

  static importJSON(serializedNode: SerializedCustomTagNode): CustomTagNode {
    return $createCustomTagNode(serializedNode.tagName).updateFromJSON(
      serializedNode,
    );
  }

  exportJSON(): SerializedCustomTagNode {
    return {
      ...super.exportJSON(),
      tagName: this.__tag,
    };
  }

  createDOM(): HTMLElement {
    return document.createElement(this.__tag);
  }

  updateDOM(prevNode: CustomTagNode, dom: HTMLElement): boolean {
    if (prevNode.__tag !== this.__tag) {
      return true;
    }
    return false;
  }
}

export function $createCustomTagNode(tagName: string): CustomTagNode {
  const customTagNode = new CustomTagNode(tagName);
  return $applyNodeReplacement(customTagNode);
}

export function $isCustomTagNode(
  node: LexicalNode | null | undefined,
): node is CustomTagNode {
  return node instanceof CustomTagNode;
}
