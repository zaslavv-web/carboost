import HRDEmployeeMap from "@/components/HRDEmployeeMap";

/**
 * Полноэкранная карта сотрудников — открывается в отдельном окне/вкладке.
 */
const EmployeeMapPage = () => (
  <div className="p-4 md:p-6">
    <HRDEmployeeMap standalone />
  </div>
);

export default EmployeeMapPage;
