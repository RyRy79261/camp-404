import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "./badge";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";

const meta = {
  title: "Components/Table",
  component: Table,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Table>;

export default meta;

type Story = StoryObj<typeof meta>;

const roster = [
  { name: "Ada Lovelace", handle: "@ada", country: "South Africa", rank: 2 },
  { name: "Grace Hopper", handle: "@grace", country: "Namibia", rank: 3 },
  { name: "Alan Turing", handle: "@alan", country: "United Kingdom", rank: 1 },
];

export const Default: Story = {
  render: () => (
    <div className="w-[560px] rounded-lg border bg-card">
      <Table>
        <TableCaption>Camp 404 roster — Clan rank by member.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead>Handle</TableHead>
            <TableHead>Country</TableHead>
            <TableHead className="text-right">Rank</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {roster.map((r) => (
            <TableRow key={r.handle}>
              <TableCell className="font-medium">{r.name}</TableCell>
              <TableCell className="font-mono text-muted-foreground">
                {r.handle}
              </TableCell>
              <TableCell>{r.country}</TableCell>
              <TableCell className="text-right">
                <Badge variant="outline">{r.rank}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={3}>Total</TableCell>
            <TableCell className="text-right">{roster.length}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  ),
};

// The narrow frame is the point: the root's own `overflow-x-auto` scrolls the
// wide table sideways instead of letting an ancestor clip it.
export const Overflowing: Story = {
  render: () => (
    <div className="w-72 rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            {Array.from({ length: 8 }, (_, i) => (
              <TableHead key={i}>Column {i + 1}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 3 }, (_, r) => (
            <TableRow key={r}>
              {Array.from({ length: 8 }, (_, c) => (
                <TableCell key={c}>
                  r{r + 1}c{c + 1}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  ),
};
