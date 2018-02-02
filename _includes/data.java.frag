public class ProductData implements Product.Data, Serializable {

    @Override
    public void setAvailableUnits(int units) {
        availableUnits.set(units);
    }

    private InlineProperty<Integer> availableUnits = new InlineProperty<>(Integer.class);

    @Override
    public int getAvailableUnits() {
        return availableUnits.get();
    }

}
