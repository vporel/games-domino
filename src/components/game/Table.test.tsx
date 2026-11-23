import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { chainOf } from "@/game/test-utils";
import Table from "./Table";

const chain = chainOf([1, 3], [3, 3], [3, 5]);

function count(html: string, pattern: RegExp): number {
  return [...html.matchAll(pattern)].length;
}

describe("Table", () => {
  it("draws every tile of the chain", () => {
    const html = renderToStaticMarkup(<Table chain={chain} origin={1} recent={[]} targets={[]} />);
    expect(count(html, /class="tile-pop"/g)).toBe(3);
    expect(html).toContain("extrémités 1 et 5");
  });

  it("shows a slot for each end the selected tile fits, labeled with the end's value", () => {
    const none = renderToStaticMarkup(<Table chain={chain} origin={1} recent={[]} targets={[]} />);
    expect(count(none, /class="ghost-slot"/g)).toBe(0);
    const both = renderToStaticMarkup(<Table chain={chain} origin={1} recent={[]} targets={["left", "right"]} />);
    expect(count(both, /class="ghost-slot"/g)).toBe(2);
    expect(both).toContain('aria-label="Poser du côté du 1"');
    expect(both).toContain('aria-label="Poser du côté du 5"');
  });

  it("outlines the tiles of the last action", () => {
    const html = renderToStaticMarkup(<Table chain={chain} origin={1} recent={[2]} targets={[]} />);
    expect(count(html, /stroke="#f2b200"/g)).toBe(1);
  });
});
