import {
  spellNote,
  stepToY,
  TREBLE_LINE_STEPS,
  BASS_LINE_STEPS,
  ledgerStepsFor,
  TREBLE_LETTER_STEP,
  BASS_LETTER_STEP,
  type KeySignature,
} from "./notation.ts";

const SVG_NS = "http://www.w3.org/2000/svg";

const Y_OFFSET = 25; // shifts staff coordinates so the whole drawing has a positive y
const CLEF_X = 22;
const KEY_SIG_X = 46;
const KEY_SIG_GLYPH_WIDTH = 9;
const NOTES_START_X = 120; // reserves room for up to 7 key-signature accidentals
const SLOT_WIDTH = 34;
const SLOT_COUNT = 8; // simultaneously displayable notes; extra held notes are simply not shown
const LEDGER_HALF_WIDTH = 11;
const NOTEHEAD_RX = 6.5;
const NOTEHEAD_RY = 5;
const SVG_WIDTH = NOTES_START_X + SLOT_COUNT * SLOT_WIDTH + 10;
const SVG_HEIGHT = 170;

const NO_KEY_SIGNATURE: KeySignature = { type: "sharp", count: 0, letters: [] };

function y(step: number): number {
  return stepToY(step) + Y_OFFSET;
}

export class StaffView {
  private notesGroup: SVGGElement;
  private keySigGroup: SVGGElement;
  private slotByCode = new Map<string, number>();
  private freeSlots: number[] = Array.from({ length: SLOT_COUNT }, (_, i) => SLOT_COUNT - 1 - i);
  private activeMidiByCode = new Map<string, number>();
  private keySignature: KeySignature = NO_KEY_SIGNATURE;

  constructor(container: HTMLElement) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`);
    svg.setAttribute("class", "staff-svg");

    for (const step of TREBLE_LINE_STEPS) svg.appendChild(this.staffLine(step));
    for (const step of BASS_LINE_STEPS) svg.appendChild(this.staffLine(step));

    svg.appendChild(this.clefText("\u{1D11E}", 34, y(34))); // G clef, centered near B4
    svg.appendChild(this.clefText("\u{1D122}", 34, y(22))); // F clef, centered near D3

    this.keySigGroup = document.createElementNS(SVG_NS, "g");
    svg.appendChild(this.keySigGroup);

    this.notesGroup = document.createElementNS(SVG_NS, "g");
    svg.appendChild(this.notesGroup);

    container.appendChild(svg);
  }

  private staffLine(step: number): SVGLineElement {
    const el = document.createElementNS(SVG_NS, "line");
    el.setAttribute("x1", String(NOTES_START_X - 20));
    el.setAttribute("x2", String(SVG_WIDTH - 10));
    el.setAttribute("y1", String(y(step)));
    el.setAttribute("y2", String(y(step)));
    el.setAttribute("class", "staff-line");
    return el;
  }

  private clefText(glyph: string, fontSize: number, cy: number): SVGTextElement {
    const el = document.createElementNS(SVG_NS, "text");
    el.setAttribute("x", String(CLEF_X));
    el.setAttribute("y", String(cy));
    el.setAttribute("class", "clef");
    el.setAttribute("font-size", String(fontSize));
    el.textContent = glyph;
    return el;
  }

  setKeySignature(keySignature: KeySignature): void {
    this.keySignature = keySignature;

    while (this.keySigGroup.firstChild) this.keySigGroup.removeChild(this.keySigGroup.firstChild);
    const glyph = keySignature.type === "sharp" ? "♯" : "♭";
    keySignature.letters.forEach((letter, i) => {
      const x = KEY_SIG_X + i * KEY_SIG_GLYPH_WIDTH;
      for (const step of [TREBLE_LETTER_STEP[letter], BASS_LETTER_STEP[letter]]) {
        const text = document.createElementNS(SVG_NS, "text");
        text.setAttribute("x", String(x));
        text.setAttribute("y", String(y(step) + 4));
        text.setAttribute("class", "key-sig-glyph");
        text.textContent = glyph;
        this.keySigGroup.appendChild(text);
      }
    });

    // Re-spell any currently sounding notes so they follow the new key.
    for (const [code, midi] of this.activeMidiByCode) this.renderNote(code, midi);
  }

  noteOn(code: string, midi: number): void {
    if (!this.slotByCode.has(code)) {
      const slot = this.freeSlots.pop();
      if (slot === undefined) return;
      this.slotByCode.set(code, slot);
    }
    this.activeMidiByCode.set(code, midi);
    this.renderNote(code, midi);
  }

  private renderNote(code: string, midi: number): void {
    const slot = this.slotByCode.get(code);
    if (slot === undefined) return;
    this.notesGroup.querySelector(`[data-code="${code}"]`)?.remove();

    const useFlats = this.keySignature.type === "flat";
    const spelling = spellNote(midi, useFlats);
    const impliedByKeySig = this.keySignature.letters.includes(spelling.letter);

    const cx = NOTES_START_X + slot * SLOT_WIDTH + SLOT_WIDTH / 2;
    const cy = y(spelling.step);

    const g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("data-code", code);

    for (const ledgerStep of ledgerStepsFor(spelling.step)) {
      const ledger = document.createElementNS(SVG_NS, "line");
      ledger.setAttribute("x1", String(cx - LEDGER_HALF_WIDTH));
      ledger.setAttribute("x2", String(cx + LEDGER_HALF_WIDTH));
      ledger.setAttribute("y1", String(y(ledgerStep)));
      ledger.setAttribute("y2", String(y(ledgerStep)));
      ledger.setAttribute("class", "ledger-line");
      g.appendChild(ledger);
    }

    // Only draw an accidental when it isn't already implied by the key
    // signature; a natural note whose letter the key signature alters needs
    // an explicit natural sign to cancel it.
    let accidentalGlyph: string | null = null;
    if (spelling.accidental !== "natural" && !impliedByKeySig) {
      accidentalGlyph = spelling.accidental === "sharp" ? "♯" : "♭";
    } else if (spelling.accidental === "natural" && impliedByKeySig) {
      accidentalGlyph = "♮";
    }
    if (accidentalGlyph) {
      const accidental = document.createElementNS(SVG_NS, "text");
      accidental.setAttribute("x", String(cx - 13));
      accidental.setAttribute("y", String(cy + 4));
      accidental.setAttribute("class", "accidental");
      accidental.textContent = accidentalGlyph;
      g.appendChild(accidental);
    }

    const head = document.createElementNS(SVG_NS, "ellipse");
    head.setAttribute("cx", String(cx));
    head.setAttribute("cy", String(cy));
    head.setAttribute("rx", String(NOTEHEAD_RX));
    head.setAttribute("ry", String(NOTEHEAD_RY));
    head.setAttribute("class", "notehead");
    g.appendChild(head);

    const accidentalSuffix = spelling.accidental === "sharp" ? "#" : spelling.accidental === "flat" ? "b" : "";
    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("x", String(cx));
    label.setAttribute("y", String(spelling.step >= 28 ? cy - 9 : cy + 14));
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("class", "note-name");
    label.textContent = `${spelling.letter}${accidentalSuffix}${Math.floor(midi / 12) - 1}`;
    g.appendChild(label);

    this.notesGroup.appendChild(g);
  }

  noteOff(code: string): void {
    const slot = this.slotByCode.get(code);
    if (slot === undefined) return;
    this.slotByCode.delete(code);
    this.activeMidiByCode.delete(code);
    this.freeSlots.push(slot);
    this.notesGroup.querySelector(`[data-code="${code}"]`)?.remove();
  }
}
