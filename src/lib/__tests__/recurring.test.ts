import { describe, expect, it } from "vitest";

import {
  detectDayOfMonth,
  detectPriceIncrease,
  detectRecurring,
  isMonthlyInterval,
  safeDayOfMonth,
} from "@/lib/recurring";
import { makeTransaction, utc } from "./factories";

/**
 * `recurring.ts` is a heuristic: it guesses which repeated charges are
 * subscriptions. Both failure directions are user-visible, so both are pinned
 * here — a supermarket flagged as a fixed monthly cost, or a real Netflix
 * subscription dropped because its price moved.
 */

const payees = new Map([["payee-netflix", "Netflix"]]);

/** One charge per month, same amount — the unambiguous subscription shape. */
function monthlyExpenses(count: number, amountMinor: number, payeeId = "payee-netflix") {
  const months = ["2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06"];
  return months.slice(0, count).map((month, i) =>
    makeTransaction({
      date: utc(`${month}-10`),
      type: "expense",
      amountMinor,
      payeeId,
      description: `COMPRA NETFLIX ${i}`,
    })
  );
}

describe("detectRecurring", () => {
  it("flags a charge that repeats at a stable amount across three months", () => {
    const groups = detectRecurring(monthlyExpenses(3, 50_000), payees);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      label: "Netflix",
      currency: "COP",
      monthsSeen: 3,
      transactionCount: 3,
      averageAmountMinor: 50_000,
      totalAmountMinor: 150_000,
    });
  });

  it("requires at least three distinct months, not three transactions", () => {
    // Three charges inside one month is a frequent stop, not a subscription.
    const txs = ["01", "08", "15"].map((day) =>
      makeTransaction({
        date: utc(`2025-03-${day}`),
        type: "expense",
        amountMinor: 50_000,
        payeeId: "payee-netflix",
      })
    );

    expect(detectRecurring(txs, payees)).toHaveLength(0);
  });

  it("excludes a merchant with wildly variable amounts", () => {
    // The supermarket case. Amounts of 10k / 100k / 200k have a coefficient of
    // variation around 0.75, well past the 0.35 ceiling — flagging this as a
    // fixed monthly cost would be plainly wrong.
    const txs = [10_000, 100_000, 200_000].map((amountMinor, i) =>
      makeTransaction({
        date: utc(`2025-0${i + 1}-05`),
        type: "expense",
        amountMinor,
        payeeId: "payee-groceries",
        description: "SUPERMERCADO",
      })
    );

    expect(detectRecurring(txs, payees)).toHaveLength(0);
  });

  it("tolerates FX drift on a subscription billed in another currency", () => {
    // A USD plan charged in COP drifts with the exchange rate. 195k–205k around
    // a 200k mean is a ~2% spread and must still read as fixed, otherwise every
    // dollar subscription silently drops out of the recurring report.
    const txs = [200_000, 205_000, 195_000].map((amountMinor, i) =>
      makeTransaction({
        date: utc(`2025-0${i + 1}-10`),
        type: "expense",
        amountMinor,
        payeeId: "payee-netflix",
        description: "NETFLIX",
      })
    );

    const groups = detectRecurring(txs, payees);

    expect(groups).toHaveLength(1);
    expect(groups[0].averageAmountMinor).toBeCloseTo(200_000);
  });

  it("ignores income and transfers", () => {
    const txs = [
      ...monthlyExpenses(3, 50_000),
      // A monthly salary would otherwise look like the most stable "recurring"
      // charge in the data.
      ...[1, 2, 3].map((m) =>
        makeTransaction({
          date: utc(`2025-0${m}-01`),
          type: "income",
          amountMinor: 5_000_000,
          payeeId: "payee-empleador",
        })
      ),
      ...[1, 2, 3].map((m) =>
        makeTransaction({
          date: utc(`2025-0${m}-02`),
          type: "transfer",
          amountMinor: 1_000_000,
          payeeId: "payee-ahorro",
        })
      ),
    ];

    const groups = detectRecurring(txs, payees);

    expect(groups.map((g) => g.key)).toEqual(["payee:payee-netflix"]);
  });

  it("groups by payee even when the raw description varies", () => {
    // The same merchant described three different ways in three statements
    // should be one group, not three misses.
    const txs = ["COMPRA EN NETFLIX", "NETFLIX.COM", "PAGO NETFLIX 8842"].map(
      (description, i) =>
        makeTransaction({
          date: utc(`2025-0${i + 1}-10`),
          type: "expense",
          amountMinor: 50_000,
          payeeId: "payee-netflix",
          description,
        })
    );

    const groups = detectRecurring(txs, payees);

    expect(groups).toHaveLength(1);
    expect(groups[0].transactionCount).toBe(3);
  });

  it("falls back to the lowercased description when no payee is set", () => {
    const txs = ["  Spotify ", "SPOTIFY", "spotify"].map((description, i) =>
      makeTransaction({
        date: utc(`2025-0${i + 1}-10`),
        type: "expense",
        amountMinor: 30_000,
        payeeId: null,
        description,
      })
    );

    const groups = detectRecurring(txs, payees);

    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("desc:spotify");
  });

  it("skips transactions with neither a payee nor a description", () => {
    // Nothing to group on, so there is nothing to conclude.
    const txs = [1, 2, 3].map((m) =>
      makeTransaction({
        date: utc(`2025-0${m}-10`),
        type: "expense",
        amountMinor: 30_000,
        payeeId: null,
        description: null,
      })
    );

    expect(detectRecurring(txs, payees)).toHaveLength(0);
  });

  it("picks the most frequent category as the group's category", () => {
    const txs = [
      ...["2025-01", "2025-02"].map((month) =>
        makeTransaction({
          date: utc(`${month}-10`),
          type: "expense",
          amountMinor: 50_000,
          payeeId: "payee-netflix",
          categoryId: "cat-entretenimiento",
        })
      ),
      makeTransaction({
        date: utc("2025-03-10"),
        type: "expense",
        amountMinor: 50_000,
        payeeId: "payee-netflix",
        categoryId: "cat-servicios",
      }),
    ];

    expect(detectRecurring(txs, payees)[0].categoryId).toBe("cat-entretenimiento");
  });

  it("reports null category when the group has no categorised transactions", () => {
    const groups = detectRecurring(monthlyExpenses(3, 50_000), payees);

    expect(groups[0].categoryId).toBeNull();
  });

  it("sorts by average amount, largest first", () => {
    const txs = [
      ...monthlyExpenses(3, 30_000),
      ...["2025-01", "2025-02", "2025-03"].map((month) =>
        makeTransaction({
          date: utc(`${month}-10`),
          type: "expense",
          amountMinor: 900_000,
          payeeId: "payee-arriendo",
          description: "ARRIENDO",
        })
      ),
    ];

    const groups = detectRecurring(txs, new Map([["payee-arriendo", "Arriendo"]]));

    expect(groups.map((g) => g.key)).toEqual(["payee:payee-arriendo", "payee:payee-netflix"]);
  });

  it("treats a zero-mean group as perfectly stable rather than dividing by zero", () => {
    // A 0/0 coefficient of variation would be NaN, and `NaN > 0.35` is false —
    // so a group of zero-value charges silently counts as recurring. Pinned so
    // the guard is intentional rather than accidental.
    const txs = [1, 2, 3].map((m) =>
      makeTransaction({
        date: utc(`2025-0${m}-10`),
        type: "expense",
        amountMinor: 0,
        payeeId: "payee-cortesia",
      })
    );

    expect(detectRecurring(txs, payees)).toHaveLength(1);
  });
});

/**
 * Price increases, ROADMAP §1.4.
 *
 * A subscription that quietly goes from 35.000 to 42.000 is invisible in every
 * other number on this page: the monthly estimate averages it away, and the
 * ledger shows a charge that looks like all the others. These pin the cases
 * where the alert must fire and — more importantly — where it must not, since
 * an alert that cries wolf on every drifting subscription is worse than none.
 */
describe("detectPriceIncrease", () => {
  it("reports a rise against what the charge used to be, not against the group mean", () => {
    // The dilution this avoids: the all-history mean of 35/35/42 is 37.3k, so
    // comparing the latest charge to it would quote a 12% rise on a base that
    // already contains the increase. The comparison the user wants is against
    // the price they were actually paying.
    const change = detectPriceIncrease(42_000, [35_000, 35_000]);

    expect(change).toEqual({
      previousAverageMinor: 35_000,
      latestAmountMinor: 42_000,
      deltaMinor: 7_000,
      ratio: 1.2,
    });
  });

  it("ignores a rise smaller than ten percent", () => {
    // 35.000 → 36.000 is real but not worth an alert; on a big subscription it
    // would be noise, and the page would train the user to skim past the card.
    expect(detectPriceIncrease(36_000, [35_000, 35_000])).toBeNull();
  });

  it("ignores a rise that stays inside the charge's own month-to-month drift", () => {
    // A USD plan billed in pesos drifts with the exchange rate. Here the
    // previous charges swing ±5k (sd ≈ 4.1k) and the latest is 4k above their
    // mean — above the 10% ratio, but indistinguishable from the drift itself.
    // Without the deviation floor this would alert every single month.
    expect(detectPriceIncrease(204_000, [200_000, 210_000, 195_000])).toBeNull();
  });

  it("still reports a real increase on a charge that drifts", () => {
    // Same drift as above, but the latest charge is well outside the band: the
    // noise floor must not swallow a genuine price rise.
    const change = detectPriceIncrease(240_000, [200_000, 210_000, 195_000]);

    expect(change).toEqual({
      previousAverageMinor: 201_666.66666666666,
      latestAmountMinor: 240_000,
      deltaMinor: 38_333.33333333334,
      ratio: 240_000 / 201_666.66666666666,
    });
  });

  it("returns null for a drop and for an unchanged charge", () => {
    // The alert is one-directional on purpose: a plan that got cheaper is good
    // news, and the page has no room to say so without implying something is
    // wrong.
    expect(detectPriceIncrease(30_000, [35_000, 35_000])).toBeNull();
    expect(detectPriceIncrease(35_000, [35_000, 35_000])).toBeNull();
  });

  it("needs at least two previous charges to call something an average", () => {
    // Against a single data point every difference looks like a price change,
    // and the second charge of a brand-new subscription would be reported as
    // one.
    expect(detectPriceIncrease(42_000, [35_000])).toBeNull();
  });

  it("reports a first paid charge as an increase from nothing, without a percentage", () => {
    // A trial that converts to a paid plan is a real change the user paid for.
    // There is no base to put a percentage on, and `Infinity%` is not a thing
    // to show anyone.
    const change = detectPriceIncrease(30_000, [0, 0]);

    expect(change).toEqual({
      previousAverageMinor: 0,
      latestAmountMinor: 30_000,
      deltaMinor: 30_000,
      ratio: null,
    });
  });

  it("does not report an all-zero group as an increase", () => {
    expect(detectPriceIncrease(0, [0, 0, 0])).toBeNull();
  });
});

describe("detectRecurring price changes", () => {
  it("attaches the latest price move to the group", () => {
    const txs = [35_000, 35_000, 42_000].map((amountMinor, i) =>
      makeTransaction({
        date: utc(`2025-0${i + 1}-10`),
        type: "expense",
        amountMinor,
        payeeId: "payee-netflix",
        description: "NETFLIX",
      })
    );

    const group = detectRecurring(txs, payees)[0];

    expect(group.priceChange).toEqual({
      previousAverageMinor: 35_000,
      latestAmountMinor: 42_000,
      deltaMinor: 7_000,
      ratio: 1.2,
    });
  });

  it("carries no price change on a stable subscription", () => {
    expect(detectRecurring(monthlyExpenses(4, 50_000), payees)[0].priceChange).toBeNull();
  });

  it("does not compare a charge against a price change from before it", () => {
    // A rise followed by three months at the new price is not a new increase.
    // Re-alerting it every month would make the number meaningless.
    const txs = [35_000, 42_000, 42_000, 42_000].map((amountMinor, i) =>
      makeTransaction({
        date: utc(`2025-0${i + 1}-10`),
        type: "expense",
        amountMinor,
        payeeId: "payee-netflix",
        description: "NETFLIX",
      })
    );

    expect(detectRecurring(txs, payees)[0].priceChange).toBeNull();
  });

  it("cannot catch a rise steep enough to break the stability gate", () => {
    // The documented blind spot, pinned so it stays a known limit rather than a
    // surprise. 35k → 90k gives a coefficient of variation near 0.49, past the
    // 0.35 ceiling, so the group is not recognised as a subscription at all and
    // there is no price change to report. Catching this needs a per-group trend
    // rather than a single stability test (ROADMAP §2.2).
    const txs = [35_000, 35_000, 90_000].map((amountMinor, i) =>
      makeTransaction({
        date: utc(`2025-0${i + 1}-10`),
        type: "expense",
        amountMinor,
        payeeId: "payee-netflix",
        description: "NETFLIX",
      })
    );

    expect(detectRecurring(txs, payees)).toHaveLength(0);
  });
});

describe("detectRecurring median interval", () => {
  /** One charge every `days` from the given start, same amount. */
  function everyDays(days: number, count: number) {
    const start = Date.UTC(2025, 0, 10, 12);
    return Array.from({ length: count }, (_, i) =>
      makeTransaction({
        date: new Date(start + i * days * 86_400_000),
        type: "expense",
        amountMinor: 40_000,
        payeeId: "payee-servicio",
        description: "SERVICIO",
      })
    );
  }

  it("measures the gap between charges instead of assuming a month", () => {
    // The 30-day projection depends on this number. Hardcoding 30 would put a
    // charge every 20 days in the wrong week, and detection has no reason to
    // assume that everything it finds is monthly.
    expect(detectRecurring(everyDays(20, 6), payees)[0].medianIntervalDays).toBe(20);
  });

  it("cannot see a charge that never spans three calendar months", () => {
    // A limit of the detection, not of this function, and worth knowing before
    // building anything on top: the MIN_MONTHS test counts distinct calendar
    // months, so a weekly subscription is invisible here. It needs 3 months of
    // history to qualify at all, which rules out anything much faster than
    // fortnightly. Pinned because the projection's own docs assume otherwise.
    const txs = [0, 7, 14, 21, 28].map((offset) =>
      makeTransaction({
        date: new Date(Date.UTC(2025, 0, 10, 12) + offset * 86_400_000),
        type: "expense",
        amountMinor: 40_000,
        payeeId: "payee-domicilios",
        description: "DOMICILIOS",
      })
    );

    expect(detectRecurring(txs, payees)).toHaveLength(0);
  });

  it("is the median, so one missed charge does not move the estimate", () => {
    // Gaps of 30, 30, 60: the median is still 30. With the mean it would be 40,
    // and the projection would claim the next Netflix charge is in 40 days when
    // it is in 30.
    const txs = ["2025-01-10", "2025-02-09", "2025-03-11", "2025-05-10"].map((date) =>
      makeTransaction({
        date: utc(date),
        type: "expense",
        amountMinor: 40_000,
        payeeId: "payee-servicio",
        description: "SERVICIO",
      })
    );

    expect(detectRecurring(txs, payees)[0].medianIntervalDays).toBe(30);
  });

  it("is null with fewer than three charges, where there is no interval to speak of", () => {
    // Two charges give one gap, and a single difference is not a rate: one pair of
    // dates is as likely to be a coincidence as a schedule. The projection skips
    // these groups rather than projecting a fabricated interval.
    const txs = ["2025-01-10", "2025-02-09"].map((date) =>
      makeTransaction({
        date: utc(date),
        type: "expense",
        amountMinor: 40_000,
        payeeId: "payee-servicio",
        description: "SERVICIO",
      })
    );

    expect(detectRecurring(txs, payees)).toHaveLength(0);
  });
});

/**
 * ROADMAP §2.2 — the three ways the detector was throwing away information it
 * already had. All three produced a report that was confidently wrong: charges
 * that should have grouped didn't, an "average" nobody was ever charged, and
 * subscriptions that had been cancelled for months still listed as current.
 */
describe("detectRecurring grouping", () => {
  it("groups the same merchant written three ways by the bank", () => {
    // El bug más caro del archivo. La importación YA normalizaba estas tres
    // redacciones en un solo grupo con `cleanMerchantName`, y la detección
    //usaba la descripción cruda, así que las partía otra vez: un comercio
    // escrito de tres formas eran tres grupos de uno, y ninguno parecía
    // recurrente. Es decir: la detección descartaba justo la normalización que
    // el import sí había hecho.
    const txs = ["COMPRA EN EXITO SA", "PAGO INTERBANC EXITO SA", "COMPRA EN EXITO  SA"].map(
      (description, i) =>
        makeTransaction({
          date: utc(`2025-0${i + 1}-10`),
          type: "expense",
          amountMinor: 180_000,
          payeeId: null,
          description,
        })
    );

    const groups = detectRecurring(txs, new Map());

    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("desc:exito sa");
    expect(groups[0].transactionCount).toBe(3);
  });

  it("still keeps genuinely different merchants apart", () => {
    // El riesgo de normalizar de más: dos comercios que empiezan igual no son el
    // mismo comercio, y fundirlos daría un grupo con una dispersión enorme que
    // el detector descartaría — dejando los dos fuera.
    const txs = ["COMPRA EN EXITO SA", "COMPRA EN EXITO CALI"].flatMap((description, i) =>
      [1, 2, 3].map((m) =>
        makeTransaction({
          date: utc(`2025-0${m}-10`),
          type: "expense",
          amountMinor: i === 0 ? 180_000 : 240_000,
          payeeId: null,
          description,
        })
      )
    );

    const groups = detectRecurring(txs, new Map());

    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.key).sort()).toEqual(["desc:exito cali", "desc:exito sa"]);
  });

  it("splits exactly where cleanMerchantName does, and no further", () => {
    // La limitación es de `merchant.ts`, no de la detección, y es compartida con
    // el importador: "COMPRA EXITO SA 4567" conserva el prefijo "COMPRA" a secas
    // y el código final, así que es otro grupo. Antes de este arreglo la
    // detección ni siquiera intentaba coincidir con el importador y partía
    // también las tres redacciones que SÍ se normalizan. Fijado para que quede
    // constancia de que el límite es `merchant.ts` y no esta función: si algún
    // día se amplía `cleanMerchantName`, esto cambia a la vez en las dos partes.
    const txs = ["COMPRA EN EXITO SA", "COMPRA EXITO SA 4567"].flatMap((description) =>
      [1, 2, 3].map((m) =>
        makeTransaction({
          date: utc(`2025-0${m}-10`),
          type: "expense",
          amountMinor: 180_000,
          payeeId: null,
          description,
        })
      )
    );

    const groups = detectRecurring(txs, new Map());

    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.key).sort()).toEqual([
      "desc:compra exito sa 4567",
      "desc:exito sa",
    ]);
  });

  it("prefers the payee over the description, so the label stays clean", () => {
    const txs = ["COMPRA EN NETFLIX.COM", "NETFLIX", "PAGO NETFLIX 8842"].map(
      (description, i) =>
        makeTransaction({
          date: utc(`2025-0${i + 1}-10`),
          type: "expense",
          amountMinor: 42_000,
          payeeId: "payee-netflix",
          description,
        })
    );

    expect(detectRecurring(txs, payees)[0].key).toBe("payee:payee-netflix");
  });
});

describe("detectRecurring recent average", () => {
  it("reports what it costs now, not what it cost across its whole life", () => {
    // El problema 2 de §2.2. Esta suscripción valía 20.000 durante ocho meses y
    // hoy vale 30.000. El promedio de toda la vida da 25.000 — una cifra que no
    // es el precio de nada — y el "recurrente mensual estimado" construido sobre
    // ella subestima lo que va a salir este mes por un 17 %.
    const txs = [
      ...["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"].map(
        (month) =>
          makeTransaction({
            date: utc(`${month}-10`),
            type: "expense",
            amountMinor: 20_000,
            payeeId: "payee-gimnasio",
            description: "GIMNASIO",
          })
      ),
      ...["2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04"].map(
        (month) =>
          makeTransaction({
            date: utc(`${month}-10`),
            type: "expense",
            amountMinor: 30_000,
            payeeId: "payee-gimnasio",
            description: "GIMNASIO",
          })
      ),
    ];

    const group = detectRecurring(txs, new Map([["payee-gimnasio", "Gimnasio"]]))[0];

    expect(group.latestAmountMinor).toBe(30_000);
    expect(group.recentAverageMinor).toBe(30_000);
    // El promedio histórico se conserva, pero con su propio nombre: es otra
    // pregunta ("qué costó"), no la que va bajo el título "Promedio mensual".
    expect(group.averageAmountMinor).toBe(25_000);
  });

  it("smooths across the price change instead of reporting only the latest charge", () => {
    // `recentAverageMinor` y `latestAmountMinor` no son lo mismo, y no deben
    // serlo: el promedio reciente es una ventana de seis cargos y el último es
    // un dato puntual. Con siete cargos —cuatro al precio viejo, tres al nuevo—
    // la ventana deja fuera solo el más antiguo y arrastra tres viejos, así que
    // los tres números quedan claramente distintos: 24.000 lo último, 22.000 la
    // ventana de seis, 21.714 toda la vida. Quien necesita "cuánto me van a
    // cobrar" usa el último, quien necesita "cuánto me cuesta" usa la ventana, y
    // el promedio de toda la vida no sirve bien para ninguna de las dos.
    const old = ["2026-06", "2026-07", "2026-08", "2026-09"];
    const fresh = ["2026-10", "2026-11", "2026-12"];
    const txs = [
      ...old.map((month) =>
        makeTransaction({
          date: utc(`${month}-10`),
          type: "expense",
          amountMinor: 20_000,
          payeeId: "payee-gimnasio",
          description: "GIMNASIO",
        })
      ),
      ...fresh.map((month) =>
        makeTransaction({
          date: utc(`${month}-10`),
          type: "expense",
          amountMinor: 24_000,
          payeeId: "payee-gimnasio",
          description: "GIMNASIO",
        })
      ),
    ];

    const group = detectRecurring(txs, new Map())[0];

    expect(group.latestAmountMinor).toBe(24_000);
    // Ventana de 6 sobre 7 cargos: tres viejos y tres nuevos.
    expect(group.recentAverageMinor).toBe(22_000);
    expect(group.averageAmountMinor).toBeCloseTo(21_714, 0);
  });

  it("only looks at the last six charges, not all of them", () => {
    const amounts = [20_000, 20_000, 20_000, 20_000, 50_000, 60_000, 55_000, 60_000];
    const months = ["2024-01", "2024-02", "2024-03", "2024-04", "2026-05", "2026-06", "2026-07", "2026-08"];
    const txs = amounts.map((amountMinor, i) =>
      makeTransaction({
        date: utc(`${months[i]}-10`),
        type: "expense",
        amountMinor,
        payeeId: "payee-servicio",
        description: "SERVICIO",
      })
    );

    // Esta serie tiene demasiada dispersión y el grupo no se reconoce como
    // recurrente: el coeficiente de variación da ~0,48, sobre el techo de 0,35.
    // Fijado porque es la razón por la que los promediosTrimmed no se pueden
    // probar "con cualquier dato": la puerta de entrada filtra antes.
    expect(detectRecurring(txs, new Map())).toEqual([]);
  });

  it("is the same as the lifetime mean when there are fewer than six charges", () => {
    const group = detectRecurring(monthlyExpenses(4, 50_000), payees)[0];

    expect(group.recentAverageMinor).toBe(group.averageAmountMinor);
  });
});

describe("detectDayOfMonth", () => {
  it("finds the day a monthly charge repeats on", () => {
    const group = detectRecurring(
      ["2026-01-15", "2026-02-15", "2026-03-15", "2026-04-15"].map((date) =>
        makeTransaction({
          date: utc(date),
          type: "expense",
          amountMinor: 42_000,
          payeeId: "payee-netflix",
          description: "NETFLIX",
        })
      ),
      payees
    )[0];

    expect(group.dayOfMonth).toBe(15);
    // 31, no 30: del 15 de enero al 15 de febrero hay 31 días. Por eso el rango
    // de `isMonthlyInterval` es 28–31 y no "30 más o menos".
    expect(group.medianIntervalDays).toBe(31);
  });

  it("returns null when the day drifts, instead of inventing one", () => {
    // Un cargo los días 3, 17 y 28 no tiene "día": el promedio sería 16, que no
    // es ningún día, y una transacción generada el 16 sería una fecha inventada
    // que el usuario tiene que corregir. El trabajo que la feature quita.
    expect(detectDayOfMonth([new Date(2026, 0, 3), new Date(2026, 1, 17), new Date(2026, 2, 28)])).toBeNull();
  });

  it("accepts two charges that agree, because agreement is the evidence", () => {
    // El riesgo aquí no es el tamaño de la muestra sino la deriva: dos cargos el
    // 15 son evidencia suficiente del día 15, y el detector nunca entrega un
    // grupo con menos de tres cargos (MIN_MONTHS), así que en la práctica esta
    // rama solo se alcanza desde fuera.
    expect(detectDayOfMonth([new Date(2026, 0, 15), new Date(2026, 1, 15)])).toBe(15);
  });

  it("is null for a group that is not monthly, which has no day of the month", () => {
    const start = Date.UTC(2026, 0, 3, 12);
    const txs = Array.from({ length: 8 }, (_, i) =>
      makeTransaction({
        date: new Date(start + i * 20 * 86_400_000),
        type: "expense",
        amountMinor: 45_000,
        payeeId: "payee-domicilios",
        description: "DOMICILIOS",
      })
    );

    const group = detectRecurring(txs, new Map())[0];

    expect(group.dayOfMonth).toBeNull();
  });
});

describe("isMonthlyInterval", () => {
  it("accepts the 28-to-31 day range a month-end charge produces", () => {
    // Un cargo los días 28, 29, 30 y 31 de meses sucesivos tiene 28 días de
    // diferencia en un mes y 31 en el siguiente. Es la misma suscripción
    // pagando "a fin de mes", y el filtro tiene que tolerarlo.
    for (const days of [28, 29, 30, 31]) expect(isMonthlyInterval(days), String(days)).toBe(true);
  });

  it("rejects anything faster than four weeks", () => {
    for (const days of [7, 14, 20, 27]) expect(isMonthlyInterval(days), String(days)).toBe(false);
  });

  it("rejects a quarterly charge, which has no day of the month", () => {
    expect(isMonthlyInterval(90)).toBe(false);
    expect(isMonthlyInterval(null)).toBe(false);
  });
});

describe("safeDayOfMonth", () => {
  it("keeps a valid day untouched", () => {
    expect(safeDayOfMonth(2026, 8, 15)).toBe(15);
  });

  it("clamps to the last day of a shorter month", () => {
    // Un cargo que cae el 31 no puede caer en febrero. Ajustarlo al 28 es lo
    // único razonable; inventar el 3 de marzo sería crear un movimiento en otro
    // mes y contaminar el presupuesto de ese mes.
    expect(safeDayOfMonth(2026, 1, 31)).toBe(28);
    expect(safeDayOfMonth(2024, 1, 31)).toBe(29);
    expect(safeDayOfMonth(2026, 3, 31)).toBe(30);
  });
});
