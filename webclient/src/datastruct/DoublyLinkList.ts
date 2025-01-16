import DoublyLinkable from '#/datastruct/DoublyLinkable.js';

export default class DoublyLinkList {
    readonly head: DoublyLinkable;

    constructor() {
        this.head = new DoublyLinkable();
    }

    push(node: DoublyLinkable): void {
        if (node.prev2) {
            node.uncache();
        }
        node.prev2 = this.head.prev2;
        node.next2 = this.head;
        if (node.prev2) {
            node.prev2.next2 = node;
        }
        node.next2.prev2 = node;
    }

    pop(): DoublyLinkable | null {
        const node: DoublyLinkable | null = this.head.next2;
        if (node === this.head) {
            return null;
        } else {
            node?.uncache();
            return node;
        }
    }
}
