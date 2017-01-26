/**
 * A product with a number of available units that can be ordered.
 */
public class Product extends AggregateRoot&lt;ProductKey, ProductData&gt; {

    ...

    /**
     * Placing an order implies that a given number of units of the Product are not available anymore
     */
    public void placeOrder(OrderDescription description) {
        // Pre-condition
        int unitsAvailable = getData().getAvailableUnits();
        checkThat(value(description.units).verifies(lessThan(unitsAvailable).or(equalTo(unitsAvailable))).because(
                "Cannot order more than available: " + unitsAvailable + " available, " + description.units
                + " ordered"));

        // Data update
        getData().setAvailableUnits(unitsAvailable - description.units);

        // Domain Event emission
        getUnitOfConsequence().addConsequence(new OrderPlaced(getData().getKey(), description));
    }

    /**
     * The Data interface describes a Product's data, it's implementation takes care of representation details linked
     * to storage solution
     */
    public static interface Data extends AggregateData&lt;ProductKey&gt; {

        ...

        void setAvailableUnits(int units);

        int getAvailableUnits();
    }
}