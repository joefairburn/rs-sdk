import Linkable from '#/datastruct/Linkable.js';

export default class DoublyLinkable extends Linkable {
    // constructor
    next2: DoublyLinkable | null;
    prev2: DoublyLinkable | null;

    constructor() {
        super();
        this.next2 = this;
        this.prev2 = this;
    }

    uncache(): void {
        if (!this.prev2 || !this.next2) {
            return;
        }
        this.prev2.next2 = this.next2;
        this.next2.prev2 = this.prev2;
        this.next2 = null;
        this.prev2 = null;
    }
}
