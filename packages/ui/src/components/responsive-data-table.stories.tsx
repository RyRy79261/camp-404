import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "./badge";
import {
  ResponsiveDataTable,
  type ResponsiveColumn,
} from "./responsive-data-table";

interface Answer {
  id: string;
  name: string;
  completed: string;
  diet: string;
  arrival: string;
}

const answers: Answer[] = [
  {
    id: "1",
    name: "Ada Lovelace",
    completed: "2 Sept, 14:05",
    diet: "Vegan",
    arrival: "Sunday",
  },
  {
    id: "2",
    name: "Grace Hopper",
    completed: "3 Sept, 09:12",
    diet: "No needs",
    arrival: "Monday",
  },
];

const columns: ResponsiveColumn<Answer>[] = [
  { id: "name", header: "Member", role: "title", cell: (a) => a.name },
  {
    id: "completed",
    header: "Completed",
    cell: (a) => <span className="text-muted-foreground">{a.completed}</span>,
  },
  { id: "diet", header: "Do you have any dietary needs?", cell: (a) => a.diet },
  { id: "arrival", header: "When do you arrive?", cell: (a) => a.arrival },
];

const meta = {
  title: "Components/ResponsiveDataTable",
  component: ResponsiveDataTable,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ResponsiveDataTable>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Resize below md (768px) to see the cards. */
export const QuestionnaireAnswers: Story = {
  args: { columns: [], data: [], getRowKey: () => "" },
  render: () => (
    <ResponsiveDataTable
      columns={columns}
      data={answers}
      getRowKey={(a) => a.id}
      label="Answers"
      pairLayout="stacked"
    />
  ),
};

export const WithBadge: Story = {
  args: { columns: [], data: [], getRowKey: () => "" },
  render: () => (
    <ResponsiveDataTable
      columns={[
        columns[0]!,
        {
          id: "state",
          header: "State",
          role: "badge",
          cell: () => <Badge variant="secondary">Done</Badge>,
        },
        columns[1]!,
      ]}
      data={answers}
      getRowKey={(a) => a.id}
      label="Members"
    />
  ),
};
