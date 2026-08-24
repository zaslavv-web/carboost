import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import ScenarioSchemaViewer from "../ScenarioSchemaViewer";

describe("ScenarioSchemaViewer", () => {
  it("рисует узлы для структуры brief/steps/criteria", () => {
    render(
      <ScenarioSchemaViewer
        scenario={{
          title: "Оценка лидерских компетенций",
          scenario_data: {
            brief: "Кейс по лидерству",
            steps: [{ title: "Анализ ситуации" }, { title: "Решение" }],
            criteria: ["структурность", "аргументация"],
          },
        }}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("Кейс по лидерству")).toBeTruthy();
    expect(screen.getByText("структурность")).toBeTruthy();
  });
});
